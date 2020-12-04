//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const Focas = require('../../focas-bindings/focas-endpoint');

module.exports = function (RED) {
    // ----------- Focas Endpoint -----------
    function generateStatus(status, val) {
        var obj;

        if (typeof val != 'string' && typeof val != 'number' && typeof val != 'boolean') {
            val = RED._("focas.endpoint.status.online");
        }

        switch (status) {
            case 'online':
                obj = {
                    fill: 'green',
                    shape: 'dot',
                    text: val.toString()
                };
                break;
            case 'offline':
                obj = {
                    fill: 'red',
                    shape: 'dot',
                    text: RED._("focas.endpoint.status.offline")
                };
                break;
            case 'connecting':
                obj = {
                    fill: 'yellow',
                    shape: 'dot',
                    text: RED._("focas.endpoint.status.connecting")
                };
                break;
            default:
                obj = {
                    fill: 'grey',
                    shape: 'dot',
                    text: RED._("focas.endpoint.status.unknown")
                };
        }
        return obj;
    }

      /**
     * @private
     * @param {number} errorCode 
     */
    function errorMessage(errorCode) {
        let msgText;
        switch(errorCode){
            case -16:
                msgText = RED._('focas.endpoint.error.socket');
                break;
            case -8:
                msgText = RED._('focas.endpoint.error.handle')
                break;
            default:
                msgText = "Unknown error";
        }
        return errorCode + " - " + msgText;
    }

    // <Begin> --- Config ---
    function FocasConfig(config) {
        RED.nodes.createNode(this, config);
        let reconnect_timeout = 30000;
        let node = this;

        node.cncIP = config.cncIP;
        node.cncPort = Number(config.cncPort);
        //node.keepAlive = config.keepAlive;
        node.timeout = config.timeout;
        node.cncModel = config.cncModel;
        //node.logLevel = config.logLevel;
        node.logLevel = 'info'
        node.libBuild = null;
        node.userDisconnect = false;
        node.onClose = false;

        node.connectionStatus = 'offline';
        node.disconnectCounter = 0;

        switch (node.cncModel) {
            case '0i-D':
            default:
                node.libBuild = '_focas_fs0idd';
        }

        node.connect = async function connect() {
            if (node.connectionStatus == 'online') {
                return;
            }

            node.focas = new Focas(node.libBuild, node.cncIP, node.cncPort, node.timeout, 'warn');
            await node.focas.connect();
            
            node.focas.on("error", (err) => node.onError(err));
            node.focas.on("connected", () => node.onConnect);
            node.focas.on("disconnected", () => node.onDisconnect);
        };

        node.connect();

        node.manageStatus = function manageStatus(newStatus) {
            if (node.connectionStatus == newStatus) return;

            node.connectionStatus = newStatus;
            node.emit('__STATUS__', {
                status: node.connectionStatus
            });
        }

        node.onConnect = function onConnect() {
            console.log("RED - Focas Config - onConnect");
            if(node.timerReconnect) clearTimeout(node.timerReconnect);

            node.manageStatus('online');
        };

        node.onDisconnect = async function onDisconnect() {
            console.log("RED - Focas Config - onDisconnect");
            node.manageStatus('offline');

            node.manageStatus('connecting');
        }

        node.disconnect = async function disconnect() {
            console.log("RED - Focas Config - disconnect");

            node.focas.on('exit', (e) => {node.reconnect(e)});
            node.manageStatus('offline');

            await node.focas.destroy();
        };

        node.reconnect = function reconnect(e) {
            console.log("RED - Focas Config - reconnect");
            console.log("child_process exit code: " + String (e))
            node.disconnectCounter = 0;

            /* now that the child process is done we can remove all listeners */
            node.removeListeners();
            node.connect();
        };

        node.getStatus = function getStatus() {
            return node.connectionStatus;
        }

        node.onError = function onError(error) {
            console.log("RED - Focas Config - onError", node.onClose);

            node.manageStatus('offline');

            node.error(errorMessage(error.code));

            if (node.disconnectCounter >= 3)  return node.disconnect();
            node.disconnectCounter++;
        };

        node.onClose = function onClose(error) {
            console.log("RED - Focas Config - onClose");
            node.error(errorMessage(error.code));
            if (node.onClose) {
                return;
            }
            
            node.manageStatus('offline');
            node.emit("disconnect");

            node.removeListeners();

            if(node.timerReconnect) clearTimeout(node.timerReconnect);
            node.timerReconnect = setTimeout(() => node.reconnect(), reconnect_timeout);
        };

        node.removeListeners = function removeListeners() {
            console.log("RED - Focas Config - removeListeners");
            node.focas.removeListener("error", (err) => node.onError(err));
            node.focas.removeListener("connected", (data) => node.onConnect(data));
            node.focas.removeListener("disconnected", (data) => node.onDisconnect(data));
        };

        node.on("close", () => {
            console.log("RED - Focas Config - 'close' event");
            node.onClose = true;
            if(node.timerReconnect) clearTimeout(node.timerReconnect);

            node.removeListeners();

            node.manageStatus('offline')
            node.focas.destroy();

        });
    }

    RED.nodes.registerType("focas config", FocasConfig);
    // <End> --- Config

    // <Begin> --- Node
    function FocasNode(config) {

        RED.nodes.createNode(this, config);

        let node = this;
        var statusVal;
        node.endpoint = RED.nodes.getNode(config.endpoint);

        node.onEndpointStatus = function onEndpointStatus(s) {
            node.generateStatus(node.endpoint.getStatus(s.status), statusVal);
        }

        node.status(generateStatus(), statusVal)
        node.endpoint.on('__STATUS__', node.onEndpointStatus);


        function sendMsg(data, key, status) {
            if(key === undefined ) key = '';

            let msg = {
                payload: data,
                topic:key
            }

            statusVal = status !== undefined ? status: data;
            node.send(msg);
        }

        node.callFocas = function callFocas(msg) {
            let fn = (config.fn) ? config.fn : msg.fn;
            let params = (msg.payload)? msg.payload : null;

            switch(fn){
                case '1': 
                    node.endpoint.focas.cncStatInfo()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                default:
                    RED._("focas.function.unknown");
                    sendMsg(new Error(RED._("focas.function.unknown")), null, null);
            }
        };

        node.on("input", (msg) => {
            node.callFocas(msg);
        });

        node.on("close", () => {

        });

    }

    RED.nodes.registerType("focas node", FocasNode);
    // <End> --- Node

};

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
        let node = this;

        node.cncIP = config.cncIP;
        node.cncPort = Number(config.cncPort);
        node.timeout = config.timeout;
        node.cncModel = config.cncModel;
        node.logLevel = config.logLevel;
        node.libBuild = null;
        node.userDisconnect = false;
        node.onClose = false;

        node.connectionStatus = 'unknown';
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

            node.focas = new Focas(node.libBuild, node.cncIP, node.cncPort, node.timeout, node.logLevel);
            await node.focas.connect();
            
            node.focas.on("error", (err) => node.onError(err));
            node.focas.on("connected", () => node.onConnect());
            node.focas.on("disconnected", () => node.onDisconnect());
            node.focas.on('exit', (code) => node.onExit(code));
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
            node.manageStatus('online');
        };

        node.onDisconnect = async function onDisconnect() {
            node.manageStatus('offline');

            node.manageStatus('connecting');
        }

        node.onExit = async function onExit(code) {
            console.log("child_process exit code:" + String(code));
            if (!code) {
                node.reconnect();
            } else {
                /* if the process exited by itself */
                await node.disconnect();
                node.reconnect();
            }
        }

        node.disconnect = async function disconnect() {
            node.manageStatus('offline');

            node.disconnectCounter = 0;
            await node.focas.destroy();
        };

        node.reconnect = function reconnect() {
            if(node.onClose) return;
            node.disconnectCounter = 0;

            /* now that the child process is done we can remove all listeners */
            node.removeListeners();
            node.connect();
        };

        node.getStatus = function getStatus() {
            return node.connectionStatus;
        }

        node.onError = function onError(error) {
            node.manageStatus('offline');

            node.error(errorMessage(error.code));

            if (node.disconnectCounter >= 3)  return node.disconnect();
            node.disconnectCounter++;
        };

        node.removeListeners = function removeListeners() {
            console.log("RED - Focas Config - removeListeners");
            node.focas.removeListener("error", node.onError);
            node.focas.removeListener("connected", node.onConnect);
            node.focas.removeListener("disconnected", node.onDisconnect);
            node.focas.removeListener('exit', node.onExit)
        };

        node.on("close", async(done) => {
            console.log("RED - Focas Config - 'close' event");
            node.onClose = true;
            if(node.timerReconnect) clearTimeout(node.timerReconnect);

            node.manageStatus('offline')
            await node.focas.destroy();
            node.removeListeners();
            done();
        });
    }

    RED.nodes.registerType("focas config", FocasConfig);
    // <End> --- Config

    // <Begin> --- Node
    function FocasNode(config) {

        RED.nodes.createNode(this, config);
        let node = this;
        var statusVal;
        node.endpoint = RED.nodes.getNode(config.config);

        node.onEndpointStatus = function onEndpointStatus(s) {
            node.status(generateStatus(s.status, statusVal));
        }

        node.status(generateStatus(node.endpoint.getStatus(), statusVal));
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
            let fn = (config.function) ? config.function : msg.fn;
            let params = (msg.payload) ? msg.payload : null;
            switch(fn){
                case '1': 
                    node.endpoint.focas.cncStatInfo()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '2': 
                    node.endpoint.focas.cncStatInfo2()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '3': 
                    node.endpoint.focas.cncSysInfo()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '4': 
                    node.endpoint.focas.cncSysInfoEx()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '5': 
                    node.endpoint.focas.cncSetTimeout(params.timeout)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '6': 
                    node.endpoint.focas.cncAbsolute(params.axis)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '7': 
                    node.endpoint.focas.cncRelative(params.axis)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '8': 
                    node.endpoint.focas.cncActs()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '9': 
                    node.endpoint.focas.cncActs2(params.sp_no)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '10': 
                    node.endpoint.focas.cncActf()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '11': 
                    node.endpoint.focas.cncAlarm2()
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '12':
                    node.endpoint.focas.cncRdAlmMsg(params.type, params.num)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '13':
                    node.endpoint.focas.cncRdTimer(params.type)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '16': 
                    node.endpoint.focas.cncRdAxisData(params.class, params.type, params.length)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '18': 
                    node.endpoint.focas.cncRdParam(params.param, params.axis)
                    .catch((e) => node.error(e))
                    .then((data) => sendMsg(data, null, null))
                    break;
                case '20': 
                    node.endpoint.focas.cncRdProgNum()
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

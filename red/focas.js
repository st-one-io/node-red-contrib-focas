//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const Focas = require('focas-library');
const {EventEmitter} = require('events');


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

    // <Begin> --- Config ---
    function FocasConfig(values) {

        EventEmitter.call(this);
        RED.nodes.createNode(this, values);

        let node = this;

        node.machineIP = values.machineIP;
        node.machinePort = Number(values.machinePort);
        node.keepAlive = values.keepAlive;
        node.timeout = values.timeout;
        //node.machine = values.machine;
        node.logLevel = values.logLevel;
        node.libBuild = null;
        node.userDisconnect = false;
        node.onClose = false;

        node.connectionStatus = 'offline';

        switch (node.machine) {
            case '0i':
            default:
                node.libBuild = '_focas_fs0idd';
        }

        node.connect = async function connect() {

            if (node.connectionStatus == 'online') {
                return;
            }

            clearTimeout(node.timerReconnect);

            node.focas = new Focas(node.libBuild, node.machineIP, node.machinePort, node.timeout, node.logLevel);
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

            clearTimeout(node.timerReconnect);

            node.manageStatus('online');
        };

        node.onDisconnect = function onDisconnect() {

        }

        node.disconnect = function disconnect() {

            node.removeListener();

            node.focas.destroy();

            node.manageStatus('offline');
            node.emit("disconnect");

            node.userDisconnect = true;
        };

        node.reconnect = function reconnect() {

            clearTimeout(node.timerReconnect);

            if (node.onClose || node.userDisconnect || (node.connectionStatus == 'online')) {
                return;
            }

            node.connect();
        };

        node.getStatus = function getStatus() {
            return node.connectionStatus;
        }

        // Begin::Event of Session Control Client - Open Protocol
        node.onError = function onError(error) {

            if (node.onClose) {
                return;
            }

            node.manageStatus('offline');

            node.emit("disconnect");

            node.error(`${RED._("open-protocol.message.failed-connect")} ${error.address}:${error.port} ${error.code}`);

            node.removeListeners();

            clearTimeout(node.timerReconnect);
            node.timerReconnect = setTimeout(() => node.reconnect(), 5000);
        };

        node.onClose = function onClose(error) {

            if (node.onClose) {
                return;
            }

            node.manageStatus('offline');
            node.emit("disconnect");

            node.removeListeners();

            clearTimeout(node.timerReconnect);
            node.timerReconnect = setTimeout(() => node.reconnect(), 5000);
        };

        node.onConnect = function onConnect(data) {
            node.emit("connect", data);
        };

        node.removeListeners = function removeListeners() {
            node.focas.removeListener("error", (err) => node.onError(err));
            node.focas.removeListener("connected", (data) => node.onConnect(data));
            node.focas.removeListener("disconnected", (data) => node.onDisconnect(data));
        };
        // End::Event of Session Control Client - Open Protocol

        node.on("close", () => {

            node.onClose = true;
            clearTimeout(node.timerReconnect);

            node.removeListeners();

            node.manageStatus('offline')
            node.emit("disconnect");
            node.focas.destroy();

        });
    }

    RED.nodes.registerType("op config", FocasConfig);
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
                case '01': 
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

    RED.nodes.registerType("op node", FocasNode);
    // <End> --- Node

};

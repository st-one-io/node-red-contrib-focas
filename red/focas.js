//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

const FocasEndpoint = require('node-focas');

module.exports = function (RED) {
    // ----------- Focas Endpoint -----------
    function generateStatus(status, val) {
        var obj;
        if (typeof val != 'string' && typeof val != 'number' && typeof val != 'boolean') {
            val = RED._('focas.endpoint.status.online');
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
                    text: RED._('focas.endpoint.status.offline')
                };
                break;
            case 'connecting':
                obj = {
                    fill: 'yellow',
                    shape: 'dot',
                    text: RED._('focas.endpoint.status.connecting')
                };
                break;
            default:
                obj = {
                    fill: 'grey',
                    shape: 'dot',
                    text: RED._('focas.endpoint.status.unknown')
                };
        }
        return obj;
    }

    // <Begin> --- Config ---
    function FocasConfig(config) {
        RED.nodes.createNode(this, config);
        let node = this;

        node.cncIP = config.cncIP;
        node.cncPort = Number(config.cncPort);
        node.timeout = config.timeout * 1000;
        node.cncModel = config.cncModel;
        node.logLevel = config.logLevel;
        node.userDisconnect = false;
        node.onClose = false;

        node.connectionStatus = 'unknown';
        node.retryTimeout = 0;
        node.onDestroy = false;

        function manageStatus(newStatus) {
            if (node.connectionStatus == newStatus) return;

            node.connectionStatus = newStatus;
            node.emit('__STATUS__', {
                status: node.connectionStatus
            });
        }

        node.connect = async function connect() {
            clearTimeout(node.retryTimeout);

            manageStatus('connecting');
            node.focas = new FocasEndpoint({address: node.cncIP, port: node.cncPort, timeout: node.timeout, log: true, logLevel: node.logLevel});  
            
            node.focas.on('error', node.onError);
            node.focas.on('connected', node.onConnect);
            node.focas.on('disconnected', node.onDisconnect);
            node.focas.on('closed', node.onClose);
            node.focas.on('timeout', node.onTimeout);

            await node.focas.connect();
        };

        node.onConnect = function onConnect() {
            manageStatus('online');
        };

        node.onDisconnect = function onDisconnect() {
            node.onError(new Error('Disconnected from device'));
        }

        node.onTimeout = function onTimeout() {
            node.onError(RED._('focas.endpoint.error.timeout'));
        }

        node.onClose = function onClose(e) {
            if (e) {
                node.onError('Socket was closed with an error ' + e);
            } else {
                node.onError((RED._('focas.endpoint.error.closed')));
            }
        }

        node.getStatus = function getStatus() {
            return node.connectionStatus;
        }

        node.onError = async function onError(e) {
            node.error(e);

            if (node.onDestroy) {
                node.onDestroy = true;
                
                node.removeListeners();
                await node.focas.destroy();
                node.focas = null; 

                node.onDestroy = false;
            }
            
            manageStatus('offline');
            node.reconnect();
            return;
        };

        node.reconnect = function reconnect() {
            node.warn(RED._('focas.info.reconnect'));

            clearTimeout(node.retryTimeout);
            node.retryTimeout = setTimeout(node.connect, 10000); 
        }

        node.removeListeners = function removeListeners() {
            node.focas.removeListener('error', node.onError);
            node.focas.removeListener('connected', node.onConnect);
            node.focas.removeListener('disconnected', node.onDisconnect);
            node.focas.removeListener('closed', node.onClose);
            node.focas.removeListener('timeout', node.onTimeout);
        };

        node.on('close', async (done) => {
            
            clearTimeout(node.retryTimeout);

            manageStatus('offline')
            
            if(node.focas) {
                node.removeListeners();
                await node.focas.destroy();
                node.focas = null;
            }

            done();
        });

        node.connect().catch(node.onError);
    }

    RED.nodes.registerType('focas config', FocasConfig);
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

        function sendMsg(msg, send, done, data) {
            // If this node is installed in Node-RED 0.x, it will need to
            // fallback to using `node.send`
            send = send || function() { node.send.apply(node,arguments) }
            msg.payload = data;
            send(msg);
            if (done) {
                done();
            }
        }


        node.on('input', (msg, send, done) => {
            
            let fn = (config.function) ? config.function : msg.fn;
            //let params = (msg.payload) ? msg.payload : null;
            switch(fn) {
                case "0":
                    msg.topic = "Status Info"; 
                    node.endpoint.focas.cncStatInfo()
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "1":
                    msg.topic = "System Info";     
                    node.endpoint.focas.cncSysInfo()
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "2":
                    msg.topic = "Timers";     
                    node.endpoint.focas.cncRdTimer(config.timerType)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "3":
                    msg.topic = "Axes Data"; 
                    node.endpoint.focas.cncRdAxisData(config.axesDataClass, config.axesDataType)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "4":
                    msg.topic = "Parameters"; 
                    node.endpoint.focas.cncRdParam(config.paramNumber, config.paramAxis)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "5":
                    msg.topic = "Program Number"; 
                    node.endpoint.focas.cncRdProgNum()
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "6":
                    msg.topic = "Sample Data"; 
                    node.endpoint.focas.sampleData(config.sampleDataNo, config.sampleDataChannels)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                case "7":
                    msg.topic = "Alarm Messages"; 
                    node.endpoint.focas.cncRdAlmMsg2(config.almType - 1 , config.almCount)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => done(error))
                    break;
                default:
                    RED._('focas.function.unknown');
                    done(new Error(RED._('focas.function.unknown')));
            }
        });

        node.on('close', () => {
        });

    }

    RED.nodes.registerType('focas node', FocasNode);
    // <End> --- Node

};

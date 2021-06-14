//@ts-check
/*
  Copyright: (c) 2018-2020, Smart-Tech Controle e Automação
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

//@ts-ignore
const FocasEndpoint = require('@protocols/node-focas');

module.exports = function (RED) {
    
    let focas = null;
    
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

        this.setMaxListeners(0);

        let cncIP = config.cncIP;
        let cncPort = Number(config.cncPort);
        let timeout = config.timeout * 1000;
        //let cncModel = config.cncModel;
        let logLevel = config.logLevel;

        let connectionStatus = 'unknown';
        let retryTimeout = null;
        let onDestroy = false;

        function manageStatus(newStatus) {
            if (connectionStatus == newStatus) return;

            connectionStatus = newStatus;
            node.emit('__STATUS__', {
                status: connectionStatus
            });
        }

        async function connect() {
            clearTimeout(retryTimeout);

            manageStatus('connecting');
            focas = new FocasEndpoint({address: cncIP, port: cncPort, timeout: timeout, log: true, logLevel: logLevel});  
            
            focas.on('error', onError);
            focas.on('connected', onConnect);
            focas.on('disconnected', onDisconnect);
            focas.on('closed', onClose);
            focas.on('timeout', onTimeout);

            await focas.connect();
        };

        function onConnect() {
            manageStatus('online');
        };

        function onDisconnect() {
            onError(new Error('Disconnected from device'));
        }

        function onTimeout() {
            onError(RED._('focas.endpoint.error.timeout'));
        }

        function onClose(e) {
            if (e) {
                onError('Socket was closed with an error ' + e);
            } else {
                onError((RED._('focas.endpoint.error.closed')));
            }
        }

        this.on('__GET_STATUS__', function() {
            node.emit('__STATUS__', {
                status: connectionStatus
            });
        });

        async function onError(e) {
            node.error(e);

            if (onDestroy) {
                onDestroy = true;
                
                removeListeners();
                await focas.destroy().catch((err) => {
                    node.error(err);
                });
                focas = null; 

                onDestroy = false;
            }
            
            manageStatus('offline');
            reconnect();
            return;
        };

        function reconnect() {
            node.warn(RED._('focas.info.reconnect'));

            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(connect, 10000); 
        }

        function removeListeners() {
            focas.removeListener('error',onError);
            focas.removeListener('connected', onConnect);
            focas.removeListener('disconnected', onDisconnect);
            focas.removeListener('closed', onClose);
            focas.removeListener('timeout', onTimeout);
        };

        this.on('close', async (done) => {
            
            clearTimeout(retryTimeout);

            manageStatus('offline')
            
            if(focas) {
                removeListeners();
                await focas.destroy().catch((err) => {
                    node.error(err);
                });;
                focas = null;
            }

            done();
        });

        connect().catch(onError);
    }

    RED.nodes.registerType('focas config', FocasConfig);
    // <End> --- Config

    // <Begin> --- Node
    function FocasNode(config) {

        RED.nodes.createNode(this, config);
        let node = this;
        var statusVal;
        let endpoint = RED.nodes.getNode(config.config);

        function onEndpointStatus(s) {
            node.status(generateStatus(s.status, statusVal));
        }

        endpoint.on('__STATUS__', onEndpointStatus);
        endpoint.emit('__GET_STATUS__');

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

        function onError(msg, done, error) {
            if (done) {
                done(error);
            } else {
                node.error(error, msg);
            }
        }

        this.on('input', (msg, send, done) => {
            
            let fn = (config.function) ? config.function : msg.fn;
            //let params = (msg.payload) ? msg.payload : null;
            switch(fn) {
                case "0":
                    msg.topic = "Status Info"; 
                    focas.cncStatInfo()
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "1":
                    msg.topic = "System Info";     
                    focas.cncSysInfo()
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "2":
                    msg.topic = "Timers";     
                    focas.cncRdTimer(config.timerType)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "3":
                    msg.topic = "Axes Data"; 
                    let type = [parseInt(config.axesDataType)];
                    focas.cncRdAxisData(config.axesDataClass, type)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "4":
                    msg.topic = "Parameters"; 
                    focas.cncRdParam(config.paramNumber, config.paramAxis)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "5":
                    msg.topic = "Program Number"; 
                    focas.cncRdProgNum()
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "6":
                    msg.topic = "Sample Data"; 
                    focas.sampleData(config.sampleDataNo, config.sampleDataChannels)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                case "7":
                    msg.topic = "Alarm Messages"; 
                    focas.cncRdAlmMsg2(config.almType - 1 , config.almCount)
                    .then((data) => sendMsg(msg, send, done, data))
                    .catch((error) => onError(msg,done,error))
                    break;
                default:
                    RED._('focas.function.unknown');
                    done(new Error(RED._('focas.function.unknown')));
            }
        });

        this.on('close', () => {
        });

    }

    RED.nodes.registerType('focas node', FocasNode);
    // <End> --- Node

};

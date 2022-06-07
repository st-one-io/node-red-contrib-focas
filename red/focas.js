/*
  Copyright: (c) 2018-2021, ST-One
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/
const FocasEndpoint = require('@protocols/node-focas');

module.exports = function (RED) {
    
    // ----------- Focas Endpoint -----------
    function generateStatus(status) {
        switch (status) {
            case 'online':
                return {
                    fill: 'green',
                    shape: 'dot',
                    text: RED._('focas.endpoint.status.online')
                };
            case 'offline':
                return {
                    fill: 'red',
                    shape: 'dot',
                    text: RED._('focas.endpoint.status.offline')
                };
            case 'connecting':
                return {
                    fill: 'yellow',
                    shape: 'dot',
                    text: RED._('focas.endpoint.status.connecting')
                };
            default:
                return {
                    fill: 'grey',
                    shape: 'dot',
                    text: RED._('focas.endpoint.status.unknown')
                };
        }
    }

    function FocasConfig(config) {
        RED.nodes.createNode(this, config);

        this.cncIP = config.cncIP;
        this.cncPort = Number(config.cncPort);
        this.timeout = config.timeout * 1000;

        this.connectionStatus = 'unknown';
        this.retryTimeout = null;
        this.onCloseCallback = null;

        this.focas = null;

        this.manageStatus = (newStatus) => {
            if (this.connectionStatus === newStatus) return;

            this.connectionStatus = newStatus;
            this.emit('__STATUS__', this.connectionStatus);
        }

        this.connect = () => {
            this.manageStatus('connecting');

            if (this.retryTimeout) {
                clearTimeout(this.retryTimeout)
                this.retryTimeout = null;
            }

            if (this.focas) {
                this.focas.removeAllListeners()
                this.focas = null;
            }

            this.focas = new FocasEndpoint({address: this.cncIP, port: this.cncPort, timeout: this.timeout});  
            
            this.focas.on('error', error => this.onError(error));
            this.focas.on('timeout', error => this.onTimeout(error));
            this.focas.on('connected', () => this.manageStatus('online'));
            this.focas.on('disconnected', error => this.onDisconnected(error));

            this.focas.connect();
        }

        this.disconnect = () => {
            this.manageStatus('offline');
            this.focas.destroy()
        }

        this.onDisconnected = () => {
            if (this.onCloseCallback) {
                this.onCloseCallback()
                return
            } 
            
            if (!this.retryTimeout) {
                this.retryTimeout = setTimeout(this.connect, 8000)
                this.warn(RED._('focas.info.reconnect'));
            }
        }

        this.onTimeout = () => {
            this.onError(RED._('focas.endpoint.error.timeout'));
        }

        this.onError = (error) => {
            this.error(error);
            this.disconnect();
        };

        this.on('close', (done) => {
            this.onCloseCallback = done;
            this.disconnect();
        });

        this.connect();
    }

    RED.nodes.registerType('focas config', FocasConfig);
    // <End> --- Config

    // <Begin> --- Node
    function FocasNode(config) {

        RED.nodes.createNode(this, config);
        const endpoint = RED.nodes.getNode(config.config);

        this.onEndpointStatus = (status) => {
            this.status(generateStatus(status));
        }

        endpoint.on('__STATUS__', status => this.onEndpointStatus(status));
        this.onEndpointStatus(endpoint.connectionStatus);

        this.sendMsg = (msg, send, done, data) => {
            // If this node is installed in Node-RED 0.x, it will need to
            // fallback to using `node.send`
            send = send || (() => { this.send.apply(this,arguments) })
            msg.payload = data;
            send(msg);
            if (done) done();
        }

        this.onError = (msg, done, error) => {
            if (done) done(error);
            else this.error(error, msg);
        }

        this.on('input', (msg, send, done) => {
            
            if (endpoint.connectionStatus !== 'online' ) {
                this.onError(msg, done, RED._('focas.endpoint.error.offline'))
                return
            }
            
            const fn = config.function || msg.fn;
            switch(fn) {
                case "0":
                    msg.topic = "Status Info"; 
                    endpoint.focas.cncStatInfo()
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "1":
                    msg.topic = "System Info";     
                    endpoint.focas.cncSysInfo()
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "2":
                    msg.topic = "Timers";     
                    endpoint.focas.cncRdTimer(config.timerType)
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "3":
                    msg.topic = "Axes Data"; 
                    let type = [parseInt(config.axesDataType)];
                    endpoint.focas.cncRdAxisData(config.axesDataClass, type)
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "4":
                    msg.topic = "Parameters"; 
                    endpoint.focas.cncRdParam(config.paramNumber, config.paramAxis)
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "5":
                    msg.topic = "Program Number"; 
                    endpoint.focas.cncRdProgNum()
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "6":
                    msg.topic = "Sample Data"; 
                    endpoint.focas.sampleData(config.sampleDataNo, config.sampleDataChannels)
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "7":
                    msg.topic = "Alarm Messages"; 
                    endpoint.focas.cncRdAlmMsg2(config.almType - 1 , config.almCount)
                    .then((data) => this.sendMsg(msg, send, done, data))
                    .catch((error) => this.onError(msg,done,error))
                    break;
                default:
                    this.onError(msg,done,RED._('focas.endpoint.error.unknown'))
            }
        });

        this.on('close', () => {
        });

    }

    RED.nodes.registerType('focas node', FocasNode);
    // <End> --- Node

};

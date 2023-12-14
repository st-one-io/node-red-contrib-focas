/*
  Copyright: (c) 2018-2021, ST-One
  GNU General Public License v3.0+ (see LICENSE or https://www.gnu.org/licenses/gpl-3.0.txt)
*/

try {
    var FocasEndpoint = require('@protocols/node-focas');
} catch (error) {
    var FocasEndpoint = null;
}


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
        let msg ={}

        this.focas = null;

        this.manageStatus = (newStatus) => {
            if (this.connectionStatus === newStatus) return;

            this.connectionStatus = newStatus;
            this.emit('__STATUS__', this.connectionStatus);
        }

        this.connect = () => {
            
            if (!FocasEndpoint) return this.error('Missing "@protocols/node-focas" dependency, avaliable only on the ST-One hardware. Please contact us at "st-one.io" for pricing and more information.')
            
            this.manageStatus('connecting');

            this.clear();

            this.focas = new FocasEndpoint({address: this.cncIP, port: this.cncPort, timeout: this.timeout});  
            
            this.focas.on('error', error => this.onError(error));
            this.focas.on('timeout', error => this.onTimeout(error));
            this.focas.on('connected', () => this.manageStatus('online'));
            this.focas.on('disconnected', () => this.onDisconnected());

            this.focas.connect();
        }

        this.clear = () => {
            if (this.focas) {
                this.focas.removeAllListeners()
                this.focas = null;
            }
            
            if (this.retryTimeout) {
                clearTimeout(this.retryTimeout)
                this.retryTimeout = null;
            }
        }

        this.disconnect = () => {
            this.manageStatus('offline');
            if (this.focas) this.focas.destroy();
            else if (this.onCloseCallback) this.onCloseCallback();
        }

        this.onDisconnected = () => {
            if (this.onCloseCallback) {
                this.clear();
                this.onCloseCallback();
                return
            } 
            
            if (!this.retryTimeout) {
                this.retryTimeout = setTimeout(this.connect, 8000)
            }
        }

        this.onTimeout = () => {
            this.onError({Timeout:RED._('focas.endpoint.error.timeout')});
        }

        this.onError = (error) => {
            this.error(`${error}`,msg.error);
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
                case "8":
                    msg.topic = "Macro"
                    endpoint.focas.cncRdMacro(config.macroNumber)
                    .then((data) => {this.sendMsg(msg, send, done, data)})
                    .catch((error) => this.onError(msg,done,error))
                    break;
                case "9":
                    msg.topic = "Exec Program";
                    endpoint.focas.cncRdExecProg(config.rdexecProg)
                    .then((data) => {this.sendMsg(msg, send, done, data)})
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

const axios = require('axios');
const RabbitMQ = require('./rabbitmq-lib');
const Promise = require('bluebird');
const os = require('os');

class Logger {
    constructor(config) {
        config.transport = String(config.transport).toLowerCase();
        if (!['http', 'amqp', 'console'].includes(config.transport)) {
            console.warn(`Invalid transport config "${config.transport}", transport set to "console"`);
            config.transport = 'console';
        }

        this.config = config;
        this.logLevels = {
            EMERGENCY: 0,
            ALERT: 1,
            CRITICAL: 2,
            ERROR: 3,
            WARNING: 4,
            NOTICE: 5,
            INFORMATIONAL: 6,
            DEBUG: 7
        }
        this.errorReporters = {
            api: this.reportApiError.bind(this),
            socket: this.reportSocketError.bind(this),
            axios: this.reportAxiosError.bind(this),
            unexpectedApiErr: this.reportUnexpectedApiError.bind(this),
            undefined: this.reportGeneralError.bind(this)
        };

        const _this = this;
        if (config.transport === 'http') {
            this.loggerApi = axios.create();
            const httpRequestOptions = {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                proxy: false,
                timeout: config.httpTimeout || 2000
            };
            if (config.httpAuthUsername && config.httpAuthPassword) {
                httpRequestOptions.auth = {
                    username: config.httpAuthUsername,
                    password: config.httpAuthPassword
                }
            }
            this.sendLog = (logObject) => _this.loggerApi.post(config.httpUrl, logObject, httpRequestOptions)
        } else if (config.transport === 'amqp') {
            this.rabbitMQ = new RabbitMQ({
                hostname: config.amqpHost || '127.0.0.1',
                port: config.amqpPort || 5672,
                username: config.amqpUser || 'guest',
                password: config.amqpPassword || 'guest',
                queue: config.amqpQueue || 'default_queue',
                retryDelay: config.amqpRetryDelay || 1000
            });
            this.sendLog = (logObject) => _this.rabbitMQ.sendMessage(logObject);
        } else {
            this.sendLog = (logObject) => logObject.level === _this.logLevels.INFORMATIONAL ? console.info(logObject) : console.error(logObject);
        }
    }

    init(ms = 500) {
        // wait for some milliseconds to init rabbitmq for first time.
        if (this.rabbitMQ) {
            return Promise.cast(this.rabbitMQ.connect())
                .timeout(ms)
                .catch(error => console.error(error));
        }
        return Promise.resolve();
    }

    report(shortMessage, fullMessage, data = {}, level = this.logLevels.ALERT) {
        const _this = this;
        const logObject = Logger.getLogObject(shortMessage, fullMessage, data, level, this.config);

        return new Promise(async function(resolve/*, reject*/) {
            try {
                await _this.sendLog(logObject);
                resolve();
            } catch(error) {
                console.error(`Cannot report error: ${logObject.short_message}\n\n    Because of: ${error.stack}\n\n    Main error: ${logObject.full_message}\n\n    Data: `, data);
                resolve();
            }
        });
    }

    reportUnexpectedError(error, data = {}, level = this.logLevels.ALERT) {
        return this.report(error.toString(), error.stack, Logger.appendErrLocData(error, data), level);
    }

    reportUnexpectedApiError(error, data = {}) {
        this.report(error.toString(), error.stack, Logger.appendErrLocData(error, Logger.getApiRequestData(error.request, { ...error.etc, ...data })), this.logLevels.ALERT);
    }

    reportGeneralError(error, data = {}, level = this.logLevels.ERROR) {
        return this.report(error.toString(), error.stack, Logger.appendErrLocData(error, data), level);
    }

    reportInfo(shortMessage, fullMessage, data = {}, level = this.logLevels.INFORMATIONAL) {
        return this.report(shortMessage, fullMessage, data, level);
    }

    reportApiInfo(shortMessage, fullMessage, req, etc) {
        return this.reportInfo('ApiInfo ' + shortMessage, fullMessage, Logger.getApiRequestData(req, etc), this.logLevels.INFORMATIONAL);
    }

    reportSocketInfo(shortMessage, fullMessage, socket, req, etc) {
        return this.reportInfo('SocketInfo ' + shortMessage, fullMessage, Logger.getSocketRequestData(socket, req, etc), this.logLevels.INFORMATIONAL);
    }

    error(error, data = {}) {
        try {
            this.errorReporters[error.errorType](error, data);
        } catch(err) {
            this.reportGeneralError(error, data);
            this.reportGeneralError(err, data);
        }
    }

    reportApiError(error, data = {}) {
        this.report(error.toString(), error.stack, Logger.appendErrLocData(error, Logger.getApiRequestData(error.request, { ...error.etc, ...data })), error.level);
    }

    reportAxiosError(error, data = {}) {
        this.report(error.toString(), error.stack, Logger.appendErrAxiosData(error, Logger.getApiRequestData(error.mainRequest, { ...error.etc, ...data })), this.logLevels.ERROR);
    }

    reportSocketError(error, data = {}) {
        this.report(error.toString(), error.stack, Logger.appendErrLocData(error, Logger.getSocketRequestData(error.socket, error.request, { ...error.etc, ...data })), error.level);
    }

    static getLogObject(shortMessage, fullMessage, data = {}, level, config) {
        const timestamp = Date.now();

        const obj = {
            version: '1.1',
            host: os.hostname(),
            timestamp: timestamp / 1000,
            short_message: shortMessage,
            full_message: fullMessage,
            level: level,
            _env: config.env,
            _localeDate: new Date(timestamp).toLocaleString().replace(/( AM| PM)/, '.' + timestamp % 1000 + '$1'),
            _app_name: config.appName
        };

        for (let key in data) {
            obj['_' + key] = data[key];
        }

        return obj;
    }

    static getApiRequestData(req, etc) {
        const data = {
            method: req.method,
            baseUrl: req.__BASE_URL,
            originalUrl: req.originalUrl,
            ip: req.ip
        };

        if (req.auth) data.userId = req.auth.id;
        if (req.method === 'POST') {
            for (let d in req.body) {
                data['POST_' + d] = req.body[d];
            }
        } else if (req.method === 'GET') {
            for (let d in req.query) {
                data['GET_' + d] = req.query[d];
            }
        }
        if (etc) {
            for (let d in etc) {
                data['DATA_' + d] = etc[d];
            }
        }

        return data;
    }

    static getSocketRequestData(socket, req, etc) {
        const data = {
            socketId: socket.id,
            ip: socket.request.headers['x-forwarded-for'] || socket.remoteAddress
        };

        if (socket.authToken && socket.authToken.id) data.userId = socket.authToken.id;
        if (req) {
            for (let d in req) {
                data['REQ_' + d] = req[d];
            }
        }
        if (etc) {
            for (let d in etc) {
                data['DATA_' + d] = etc[d];
            }
        }

        return data;
    }

    static appendErrLocData(error, data = {}) {
        try {
            const parts = error.stack.split('\n')[1].split('(')[1].split(':');
            data.errFile = parts[0];
            data.errLine = parts[1];
        } catch(err) {
            //
        }
        return data;
    }

    static appendErrAxiosData(error, data = {}) {
        try {
            if (!error.response) {
                return data;
            }

            data.axiosStatus = error.response.status;
            data.axiosStatusText = error.response.statusText;
            data.axiosResponseData = error.response.data;

            if (error.response.config) {
                data.axiosUrl = error.response.config.url;
            }

            if (error.response.request) {
                data.axiosMethod = error.response.request.method;
                data.axiosPath = error.response.request.path;
            }
        } catch(err) {
            //
        }
        return data;
    }
}

module.exports = Logger;
module.exports.Logger = Logger;

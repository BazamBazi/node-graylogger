const amqp = require('amqplib'),
    Promise = require('bluebird');

class RabbitMQ {
    constructor(config) {
        this.config = {
            ...config,
            protocol: 'amqp',
            heartbeat: 60, // Heartbeat interval in seconds
        };
        this.connection = null;
        this.channel = null;
        this.queue = config.queue || 'default_queue';
        this.retryDelay = config.retryDelay || 1000;
        this.isConnected = false;

        this.onErrorBound = this.onError.bind(this);
        this.onCloseBound = this.onClose.bind(this);
    }

    onError(error) {
        this.isConnected = false;
        console.error('RabbitMQ connection error:', error);
        this.connect();
    }

    onClose() {
        this.isConnected = false;
        console.log('RabbitMQ connection closed');
        this.connect();
    }

    async connect() {
        if (this.isConnected) {
            return;
        }

        let attempt = 0;
        while (!this.isConnected) {
            try {
                if (attempt > 0) {
                    console.log('Attempting to reconnect to RabbitMQ...');
                }
                this.connection = await amqp.connect(this.config);
                this.channel = await this.connection.createConfirmChannel();
                await this.channel.assertQueue(this.queue, { durable: true });
                console.log('RabbitMQ connected');

                this.isConnected = true;
                this.connection.on('error', this.onErrorBound);
                this.connection.on('close', this.onCloseBound);

                return;
            } catch (error) {
                console.error(`RabbitMQ connection ${attempt > 0 ? 'reconnection' : 'failed'} (Attempt ${attempt}):`, error);
                console.log(`Waiting ${this.retryDelay}ms before next retry...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                attempt++;
            }
        }
    }

    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            this.channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(message)), { persistent: true }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async close() {
        this.isConnected = false;
        this.connection.off('error', this.onErrorBound);
        this.connection.off('close', this.onCloseBound);

        if (this.channel) {
            await this.channel.close();
        }
        if (this.connection) {
            await this.connection.close();
        }

        console.log('RabbitMQ connection closed');
        return Promise.resolve();
    }
}

module.exports = RabbitMQ;

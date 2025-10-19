# node-graylogger

## Description

A versatile Node.js logger library designed for flexible log reporting over HTTP and RabbitMQ to graylog. This module is highly configurable and allows you to report errors and informational messages to different transports, making it suitable for various application environments.

## Features

- **Multiple Transport Options:** Supports sending logs via HTTP POST requests or through RabbitMQ queues.
- **Configurable Log Levels:** Define different log levels to categorize and filter messages based on severity (e.g., INFORMATIONAL, ERROR, ALERT).
- **Error Reporting:** Specialized error reporters for API, socket, and Axios errors, providing detailed context for debugging.
- **Automatic Reconnection:** For RabbitMQ transport, the library includes automatic reconnection logic.
- **Detailed Log Objects:**  Logs include contextual information such as hostname, timestamp, log level, environment, and request-specific data (API, socket).
- **Easy Integration:** Simple to integrate into any Node.js project as an npm module.

## Installation

```bash
npm i @bazambazi/node-graylogger
```

## Usage

### Initialization

Initialize the logger with your [configuration](#configuration-options):

```javascript
const Logger = require('node-graylogger');

const loggerConfig = {
    transport: 'console', // 'http', 'amqp', or 'console'
    env: 'development', // Environment name
    appName: 'My Application' // Application name
};

const logger = new Logger(loggerConfig);

logger.init().then(() => {
    // Logger initialized
});
```

### Reporting Logs

You can report different types of logs using the logger instance:

```javascript
// Informational log
logger.reportInfo('User logged in', 'User JohnDoe successfully logged into the system', { userId: 'JohnDoe123' });

// Error log
logger.reportGeneralError(new Error('Database connection failed'), { databaseName: 'usersDB' });

// API error log (example with axios error)
axios.get('https://api.example.com/data')
    .catch(error => {
        error.errorType = 'axios';
        logger.error(error, { some: 'data' });

        // or
        logger.reportAxiosError(error, { some: 'data' });
    });

// Unexpected error log
try {
    // Some code that might throw an error
    throw new Error('Something unexpected happened');
} catch (e) {
    logger.reportUnexpectedError(e, { component: 'userService' });
}
```

### Configuration Options

| Option             | Description                                                    | Default Value |
|--------------------|----------------------------------------------------------------|---------------|
| `transport`        | Transport for logs: `http`, `amqp`, or `console`.              | console     |
| `httpUrl`          | HTTP endpoint for sending logs in `http` transport mode.       | -             |
| `httpAuthUsername` | username for basic auth in `http` transport.                   | -             |
| `httpAuthPassword` | password for basic auth in `http` transport.                   | -             |
| `httpTimeout`      | timeout for http requests in `http` transport mode. (unit: ms) | 2000          |
| `amqpHost`         | RabbitMQ hostname in `amqp` transport mode.                    | 127.0.0.1     |
| `amqpPort`         | RabbitMQ port in `amqp` transport mode.                        | 5672          |
| `amqpUser`         | RabbitMQ username in `amqp` transport mode.                    | guest         |
| `amqpPassword`     | RabbitMQ password in `amqp` transport mode.                    | guest         |
| `amqpQueue`        | RabbitMQ queue name in `amqp` transport mode.                  | default_queue |
| `amqpRetryDelay`   | RabbitMQ retry delay in ms to connect in `amqp` transport mode.| 1000          |
| `env`              | Environment name (e.g., 'development', 'production').          | -             |
| `appName`          | Application name.                                              | -             |

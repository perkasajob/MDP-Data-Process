const JSFtp = require('jsftp');
const tls = require('tls');
const net = require('net');

// Custom FTPS class with TLS session handling
class MyFTPS extends JSFtp {
    constructor(options) {
        super(options);
        this._prot_p = false; // Indicates data connection protection
        this.controlSocket = null; // To store control connection socket
    }

    // Override connect to handle TLS and store control socket
    connect(options, callback) {
        const tlsOptions = {
            host: options.host,
            port: options.port || 21,
            rejectUnauthorized: false, // Allow self-signed/expired certificates
            secure: true // Enable TLS
        };
        this.tlsOptions = tlsOptions;
        super.connect({ ...options, ...tlsOptions }, (err) => {
            if (!err) {
                this.controlSocket = this.rawClient; // Store control socket
            }
            callback(err);
        });
    }

    // Custom method for data connection with TLS session reuse
    ntransfercmd(cmd, rest = null, callback) {
        const command = rest ? `${cmd} ${rest}` : cmd;
        this.getPasvPort((err, port) => {
            if (err) return callback(err);

            const dataSocket = new net.Socket();
            dataSocket.connect(port, this.host, () => {
                this.raw(command, (err, response) => {
                    if (err) {
                        dataSocket.destroy();
                        return callback(err);
                    }

                    let size = null;
                    const match = response.message.match(/\((\d+) bytes\)/);
                    if (match) {
                        size = parseInt(match[1], 10);
                    }

                    let wrappedSocket = dataSocket;
                    if (this._prot_p) {
                        wrappedSocket = tls.connect({
                            ...this.tlsOptions,
                            socket: dataSocket,
                            session: this.controlSocket.getSession() // Reuse TLS session
                        }, () => {
                            callback(null, { socket: wrappedSocket, size });
                        });
                        wrappedSocket.on('error', (err) => {
                            callback(err);
                        });
                    } else {
                        callback(null, { socket: wrappedSocket, size });
                    }
                });
            });
            dataSocket.on('error', (err) => {
                callback(err);
            });
        });
    }

    // Enable data protection (PROT P)
    enableDataProtection(callback) {
        this.raw('PROT P', (err) => {
            if (!err) {
                this._prot_p = true;
            }
            callback(err);
        });
    }
}

// Helper function to format date strings
function getFormattedDateStrings(date) {
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return {
        date: `${year}${month}${day}`,
        date_month: `${year}${month}`
    };
}

module.exports = { MyFTPS, getFormattedDateStrings };
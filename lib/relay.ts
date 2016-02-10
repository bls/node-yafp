// Shuffle data from one TCP socket to another

/* tslint:disable */

import * as net from 'net';
import * as tls from 'tls';
import * as events from 'events';

function copy(from: net.Socket, to: net.Socket, data: Buffer) {
    if(data) {
        to.write(data);
    }
    from.pipe(to);
    to.pipe(from);
}

export function relay(sock: net.Socket, host: string,
                      port: number, data?: Buffer): net.Socket
{
    let proxySocket = new net.Socket();
    proxySocket.connect(port, host, () => copy(sock, proxySocket, data));
    return proxySocket
}


export function tlsRelay(sock: net.Socket, host: string,  port: number,
                         servername: string, data?: Buffer): net.Socket
{
    let options = {
        host: host,
        port: port,
        servername: servername
    };
    let proxySocket: any = tls.connect(options, () => copy(sock, proxySocket, data));
    return proxySocket;
}

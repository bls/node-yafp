
import * as tls from 'tls';

var options = {
    host: 'google.com',
    method: 'get',
    path: '/'
};


//var req = https.request(options,
//    function (res) {
        // Always make sure that the certificate is authorized.
        // console.log('Is authorized:' + res.socket.authorized);
        // The inspect the certificate:
//        console.log(res.socket.getPeerCertificate());
//    });

let conn = tls.connect(443, 'www.google.com');
conn.on('secureConnect', () => {
    console.log(conn.getPeerCertificate());
    conn.end();
});

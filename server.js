const Net = require('net');

const Server = Net.createServer();

Server.on('connection', (socket)=>{
  socket.write('Recibí mensaje')
    socket.on('data', (data)=>{
        console.log('Mensaje recibido desde el cliente: '+ data)
    })

    socket.on('close', ()=>{
        console.log('Comunicacion finalizada')
    })

    socket.on('error', (err)=>{
        console.log(err.message)
    })
})

Server.listen(3006, ()=>{
    console.log('El servidor esta escuchando por el puerto ', Server.address().port);
})

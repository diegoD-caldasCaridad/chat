import { Socket } from 'net';
import express from "express";
const App = express();
import { resolve } from 'path';

const socketCli = new Socket()

socketCli.connect({host: 'localhost' , port: 3006})
setInterval(myFunction,3006)

function myFunction(name) {
  socketCli.write('name');
}

socketCli.setEncoding('utf-8')
socketCli.on('data', (data)=>{
  console.log(data)
})

App.get('/', function(req, res) {
  res.sendFile(resolve(__dirname, 'index.html'));
});

App.listen(3006);
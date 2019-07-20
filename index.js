const express = require('express')
const path = require('path')

const app = express()
const server = require('http').Server(app)
server.listen(process.env.PORT || 8080)
app.use('/', express.static(path.join(__dirname, 'public')))

const WebSocket = require('ws')

const players = {}
const lastUpdate = {}
const events = []
let nextId = 0
let frame = 0

const wss = new WebSocket.Server({server})

wss.on('connection', function connection(ws) {
  const id = nextId++
  ws.send(JSON.stringify({id: id}))
  ws.on('message', function incoming(rawData) {
    try {
      const data = JSON.parse(rawData)
      players[""+id] = data
      lastUpdate[""+id] = frame
      if (data.lostCoins) {
        console.log('someone lost coins')
        events.push({id: id, event: "lostCoins"})
      }
    } catch (e) {

    }
  })
})

app.get('/playerCount', function (req, res) {
  res.send("" + wss.clients.size)
})

function netUpdate() {
  frame++
  //console.log(JSON.stringify(players))
  wss.clients.forEach(function each(client) {
    client.send(JSON.stringify(players))
    if (events.length > 0) {
      console.log('sent event')
      client.send(JSON.stringify({type: 'events', data: events}))
    }
 });
 events.length = 0

 //remove disconnected clients
 for (let id in players) {
   if (lastUpdate[id] < frame - 120) {
     delete players[id]
   }
 }
}

setInterval(netUpdate, 32)
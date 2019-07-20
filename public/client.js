/* eslint-disable no-console */
'use strict'

import { game } from './game.js'

function showMessage (m) {
  console.log(m)
}

async function getPlayerCount () {
  return await fetch('/playerCount').then(r => r.json())
}

async function load () {
  console.log('player count: ' + await getPlayerCount())
}

let ws

function connect () {
  if (ws) {
    ws.onerror = ws.onopen = ws.onclose = null
    ws.close()
  }

  const prefix = (location.protocol === 'https:') ? 'wss' : 'ws'

  ws = new WebSocket(`${prefix}://${location.host}`)
  ws.onerror = function() {
    showMessage('WebSocket error')
  }
  ws.onopen = function() {
    showMessage('WebSocket connection established')
    const sendFunc = x => ws.send(x)
    game.start(sendFunc)
  }
  ws.onclose = function() {
    showMessage('WebSocket connection closed')
  }
  ws.onmessage = function (msg) {
    game.onMessage(JSON.parse(msg.data))
  }
} 

load()
connect()
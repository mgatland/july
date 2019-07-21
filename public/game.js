/* eslint-disable no-console */
'use strict'

import { editor } from './editor.js'

const smallSprite = 24

class Player {
  constructor (x, y) {
    this.isPlayer = true
    this.pos = { x, y }
    this.vel = { x: 0, y: 0 }
    this.facingLeft = false
    this.checkpoints = {}
    this.trail = []
    this.megaBird = false
    this.fireTimer = 0
    this.refireRate = 6
    this.ammo = 0
    this.maxAmmo = 100
    this.health = 0
    this.maxHealth = 100
    this.ammo = this.maxAmmo
    this.health = this.maxHealth
  }
}

const particleTypes = {
  playerDeadPuff: { maxAge: 300, sprite: smallSprite + 4 },
  playerDeadRing: { maxAge: 1, sprite: smallSprite + 4, spawns: [{ type: 'playerDeadPuff', amount: 13, force: 0.75 }, { type: 'playerDeadPuff', amount: 19, force: 0.3 }] },
  expPuff: { maxAge: 14, sprite: smallSprite + 5 },
  expRing: { maxAge: 1, sprite: smallSprite + 5, spawns: [{ type: 'expPuff', amount: 6, force: 1 }] },
  spawnerDeadPuff: { maxAge: 120, sprite: smallSprite + 7 },
  spawnerDeadRing: { maxAge: 1, sprite: smallSprite + 7, spawns: [{ type: 'spawnerDeadPuff', amount: 7, force: 0.75 }, { type: 'spawnerDeadPuff', amount: 11, force: 0.3 }] },
  enemyDeadPuff: { maxAge: 30, sprite: smallSprite + 7 },
  enemyDeadRing: { maxAge: 1, sprite: smallSprite + 7, spawns: [{ type: 'enemyDeadPuff', amount: 7, force: 1.4 }, { type: 'enemyDeadPuff', amount: 11, force: 0.6 }] }
}

let debugMode = false
window.editMode = false

const storageKey = 'temp'

let frame = 0
let send
let netState = {}
const shots = []
const ents = []
let localId

let player

const keys = { left: false, right: false, cheat: false, up: false, down: false, shoot: false, shootHit: false }

class Enemy {
  constructor (x, y) {
    this.pos = { x, y }
    this.vel = { x: 0, y: 0 }
    this.fireTimer = 0
    this.refireRate = 0
    this.facingLeft = false
    this.fireMode = 'star'
    this.moveTimer = 0
    this.maxMoveTimer = 90
    this.fireSequence = 0
    this.health = 30
    this.maxHealth = 30
    this.sprite = 2
    this.deadEffect = 'enemyDeadRing'
    this.hurtsOnTouch = true
  }
  move () {
    if (this.fireTimer > 0) this.fireTimer--
    if (this.fireTimer === 0 && this.refireRate > 0) {
      spawnShot(this)
      this.fireTimer = this.refireRate
    }
    if (this.hurtsOnTouch && distance(this.pos, player.pos) < tileSize) {
      if (!player.winner) hurt(player, 10)
      hurt(this, 9000)
    }
  }
  _startRandomMove () {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.6
    this.vel.x = Math.cos(angle) * speed
    this.vel.y = Math.sin(angle) * speed
    this.moveTimer = this.maxMoveTimer
  }
  inActiveRange () {
    return distance(this.pos, player.pos) < tileSize * 7
  }
  draw () {
    drawSprite(this.sprite, this.pos.x, this.pos.y)
  }
}

class OhSpawner extends Enemy {
  constructor (x, y) {
    super(x, y)
    this.maxSpawnTimer = 60
    this.spawnTimer = this.maxSpawnTimer
    this.health = 200
    this.maxHealth = 200
    this.deadEffect = 'spawnerDeadRing'
    this.baseSprite = 3
    this.hurtsOnTouch = false
  }
  spawn () {
    ents.push(new OhRing(this.pos.x, this.pos.y))
  }
  move () {
    this.sprite = this.baseSprite + Math.floor(frame / 15) % 2
    if (!this.inActiveRange()) {
      return
    }
    if (this.spawnTimer > 0) {
      this.spawnTimer--
      if (this.spawnTimer === 0) {
        this.spawnTimer = this.maxSpawnTimer
        if (ents.length < maxEnts) this.spawn()
      }
    }
    super.move()
  }
}

class BatSpawner extends OhSpawner {
  constructor (x, y) {
    super(x, y)
    this.baseSprite = 14
  }
  spawn () {
    ents.push(new BatWing(this.pos.x, this.pos.y))
  }
}

class SignPost extends Enemy {
  constructor (x, y) {
    super(x, y)
    this.sprite = 17
    this.hurtsOnTouch = false
    this.isSign = true
  }
  move () {
    super.move()
  }
}


class OhRing extends Enemy {
  constructor (x, y) {
    super(x, y)
    this.refireRate = 60
    this.fireMode = 'star'
    this.maxMoveTimer = 90
    this.trash = true
  }
  move () {
    if (this.moveTimer > 0) {
      this.moveTimer--
    } else {
      this._startRandomMove()
    }
    this.pos.x += this.vel.x
    this.pos.y += this.vel.y
    if (getCollidingTiles(this.pos)) {
      this.pos.x -= this.vel.x
      this.pos.y -= this.vel.y
      this._startRandomMove()
    }
    super.move()
  }
}

class BatWing extends Enemy {
  constructor (x, y) {
    super(x, y)
    this.maxMoveTimer = 90
    this.trash = true
  }
  move () {
    this.sprite = 11 + Math.floor(frame / 6) % 3
    if (this.moveTimer > 0) {
      this.moveTimer--
    } else {
      this._startRandomMove()
    }
    this.pos.x += this.vel.x
    this.pos.y += this.vel.y
    if (getCollidingTiles(this.pos)) {
      this.pos.x -= this.vel.x
      this.pos.y -= this.vel.y
      this._startRandomMove()
    }
    super.move()
  }
}

const camera = {
  pos: { x: 0, y: 0 }
}

const checkpoints = [
]

const particles = []

const maxEnts = 30
const skyXVel = 3
const skyYVel = 2

const xAccel = 0.1
const xDecel = 0.05

const scale = 4
const tileSize = 16
let canvas
let ctx
let spriteImage

let savedMap = localStorage.getItem(storageKey)
let world = savedMap ? JSON.parse(savedMap) : {}
if (savedMap && false) {
  console.warn('Loading map from local storage. This is only for development use.')
  console.log(savedMap)
} else {
  /* eslint-disable comma-spacing */
  world =
  //{ 'width': 50, 'height': 50, 'map': [null,0,1,51,0,48,1,2,0,48,1,2,0,48,1,2,0,10,7,1,0,21,6,1,0,15,1,2,0,32,6,1,0,15,1,2,0,4,7,1,0,24,6,7,0,12,1,2,0,48,1,2,0,19,7,1,0,28,1,2,0,48,1,2,0,41,6,4,0,3,1,2,0,48,1,2,0,6,6,6,0,36,1,2,0,47,6,1,1,2,0,41,7,4,0,3,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,23,6,2,0,23,1,2,0,24,6,2,0,22,1,2,0,25,6,2,0,21,1,2,0,26,6,2,0,20,1,2,0,27,6,2,0,19,1,2,0,28,6,2,0,18,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,13,7,8,0,14,6,1,0,12,1,2,0,13,7,1,0,6,7,1,0,15,6,1,0,11,1,2,0,20,7,1,0,16,6,1,0,10,1,2,0,20,7,1,0,17,6,1,0,9,1,2,0,20,7,1,0,18,6,1,0,8,1,2,0,13,7,1,0,6,7,1,0,12,6,5,0,10,1,2,0,13,7,1,0,3,7,1,0,2,7,1,0,27,1,2,0,13,7,1,0,6,7,1,0,27,1,2,0,13,7,8,0,27,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,0,48,1,2,6,2,0,46,1,2,0,48,1,51,0,2] }
  { 'width': 50, 'height': 50, 'map': [6,13,1,37,7,1,0,11,7,1,0,36,1,1,7,1,0,11,7,1,0,20,8,1,0,15,1,1,7,1,0,11,7,1,0,12,2,1,0,14,2,1,0,8,1,1,7,1,0,11,7,1,0,20,6,1,0,15,1,1,7,1,0,6,15,1,0,4,7,1,0,5,6,1,0,14,6,1,0,15,1,1,7,1,0,11,7,1,0,5,6,1,0,9,7,2,6,7,0,12,1,1,7,1,0,11,7,1,0,5,6,1,17,1,0,8,7,1,0,20,1,1,7,1,0,11,7,1,0,5,6,3,0,7,7,1,0,10,8,1,0,9,1,1,7,1,0,11,7,1,0,15,7,1,0,20,1,1,7,1,0,11,7,1,0,15,7,1,0,10,1,1,0,9,1,1,7,1,0,8,1,2,0,1,7,1,0,6,8,1,0,8,7,1,0,9,1,3,0,8,1,1,7,5,0,2,7,6,0,15,7,1,0,9,1,3,0,8,1,2,0,25,7,3,0,8,1,5,0,6,6,1,1,2,8,1,0,22,7,2,0,2,7,1,0,4,7,16,1,2,0,9,15,1,0,11,7,2,0,4,7,1,0,20,1,2,0,19,7,2,0,6,7,1,0,20,1,3,0,16,7,2,0,8,7,1,0,20,1,4,0,13,7,2,0,10,7,1,0,7,8,1,0,8,2,1,0,3,1,5,0,10,7,2,0,8,6,2,0,2,7,1,0,20,1,2,7,13,0,11,6,2,0,1,7,1,0,20,1,2,0,25,6,2,7,1,0,16,15,1,0,3,1,2,0,26,6,2,0,20,1,2,0,27,6,2,0,7,17,1,0,11,1,2,0,28,6,2,7,14,0,4,1,2,0,28,7,1,0,19,1,2,0,28,7,1,0,19,1,2,0,28,7,1,0,1,2,1,0,17,1,2,0,28,7,1,0,19,1,2,0,27,7,2,0,1,15,1,0,17,1,2,0,27,7,2,0,19,1,2,0,27,7,2,0,10,17,1,0,8,1,2,0,21,7,8,0,6,6,13,1,2,0,13,7,9,0,6,7,1,0,6,6,1,0,12,1,2,0,13,7,1,0,6,7,1,0,7,7,1,0,7,6,1,0,11,1,2,0,20,7,1,0,7,7,1,0,8,6,1,0,10,1,2,0,20,7,1,0,7,7,1,0,6,8,1,0,2,6,1,0,9,1,2,0,20,7,1,0,7,7,1,0,5,17,1,0,4,6,1,0,8,1,2,0,13,7,1,0,6,7,1,0,7,7,1,0,4,6,7,0,8,1,2,0,13,7,1,0,3,7,1,0,2,7,1,0,7,7,1,0,19,1,2,0,13,7,1,0,6,7,1,0,7,7,1,0,19,1,2,0,13,7,8,0,7,7,1,0,16,2,1,0,2,1,2,0,28,7,1,0,5,8,1,0,13,1,2,0,28,7,1,0,19,1,2,0,28,7,1,0,16,15,1,0,2,1,2,0,28,7,1,0,5,6,1,0,13,1,2,0,28,7,1,0,19,1,2,6,2,0,26,7,1,0,19,1,2,0,28,7,1,0,14,17,1,0,4,1,51,0,2]}
  /* eslint-enable comma-spacing */
}
world.map = editor.rleDecode(world.map)

function start (sendFunc) {
  canvas = document.querySelector('canvas')
  ctx = canvas.getContext('2d', { alpha: false })
  ctx.imageSmoothingEnabled = false
  const defaultFont = "20px 'uni 05_64'"
  ctx.font = defaultFont
  ctx.fillStyle = '#140C1C'
  ctx.baseLine = 'bottom'
  spriteImage = new Image()
  spriteImage.src = 'sprites.png'
  spriteImage.addEventListener('load', loaded, false)
  send = sendFunc
}

function loaded () {
  editor.startEditor(canvas, scale, world, tileSize, player, storageKey, camera)
  tick()
}

function tick () {
  frame = (++frame % 3600)
  updatePlayer(player, keys)
  for (let id in netState) {
    if (id != localId || debugMode) {
      updatePlayer(netState[id], false)
    }
  }
  updateShots()
  updateEnts()
  updateParticles()
  keys.flap = false // special case
  draw()
  requestAnimationFrame(tick)
}

function isTouching (ent1, ent2) {
  return distance(ent1.pos, ent2.pos) < tileSize
}

function distance (pos1, pos2) {
  const dX = pos1.x - pos2.x
  const dY = pos1.y - pos2.y
  return Math.sqrt(dX * dX + dY * dY)
}

function tilePosToWorld (tilePos) {
  return { x: tilePos.x * tileSize, y: tilePos.y * tileSize }
}

function spawnExplosion (pos, type = 'expRing') {
  const p = { x: pos.x, y: pos.y, age: 0, type }
  p.xVel = 0
  p.yVel = 0
  particles.push(p)
}

function hurt (ent, amount) {
  if (ent.health <= 0) return
  ent.health -= amount
  if (ent.health <= 0) {
    ent.health = 0
    ent.dead = true
    if (ent.isPlayer) {
      spawnExplosion(ent.pos, 'playerDeadRing')
    } else {
      spawnExplosion(ent.pos, ent.deadEffect)
    }
  }
}

function updateShots () {
  for (let shot of shots) {
    shot.pos.x += shot.vel.x
    shot.pos.y += shot.vel.y
    shot.age++

    if (shot.hurtsPlayer && isTouching(shot, player)) {
      hurt(player, 10)
      spawnExplosion(shot.pos)
      shot.dead = true
      continue
    }

    if (!shot.hurtsPlayer) {
      for (const ent of ents) {
        if (isTouching(shot, ent)) {
          hurt(ent, 10)
          spawnExplosion(shot.pos)
          shot.dead = true
          continue
        }
      }
      if (shot.age > tileSize * 8 / Math.abs(shot.vel.x)) {
        spawnExplosion(shot.pos)
        shot.dead = true
        continue
      }
    }

    if (getCollidingTiles(shot.pos)) {
      shot.dead = true
      spawnExplosion(shot.pos)
    }
  }
  filterInPlace(shots, s => !s.dead)
}

function updateEnts () {
  for (let ent of ents) {
    ent.move()
    if (ent.trash && (distance(ent.pos, player.pos) > 240)) {
      ent.dead = true
    }
  }
  filterInPlace(ents, e => !e.dead)
}

function updateParticles () {
  for (let bit of particles) {
    const type = particleTypes[bit.type]
    bit.x += bit.xVel
    bit.y += bit.yVel
    bit.age++

    if (bit.age >= type.maxAge) {
      bit.dead = true
      if (type.spawns) {
        for (let spawns of type.spawns) {
          const amount = spawns.amount
          const newType = spawns.type
          const force = spawns.force
          for (let i = 0; i < amount; i++) {
            const p = { x: bit.x, y: bit.y, age: 0, type: newType }
            const angle = i / amount * Math.PI * 2
            p.xVel = force * Math.cos(angle)
            p.yVel = force * Math.sin(angle)
            particles.push(p)
          }
        }
      }
    }
  }

  filterInPlace(particles, bit => !bit.dead)
}

// https://stackoverflow.com/questions/37318808/what-is-the-in-place-alternative-to-array-prototype-filter
function filterInPlace (a, condition) {
  let i = 0
  let j = 0

  while (i < a.length) {
    const val = a[i]
    if (condition(val, i, a)) a[j++] = val
    i++
  }

  a.length = j
  return a
}

function draw () {
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  drawLevel()
  particles.forEach(p => drawParticle(p, false, true))
  if (!debugMode) drawPlayer(player)
  for (let id in netState) {
    if (id != localId || debugMode) {
      drawPlayer(netState[id])
    }
  }
  for (let shot of shots) {
    drawShot(shot)
  }
  for (let ent of ents) {
    ent.draw()
  }
  drawHUD()
}

function drawHUD () {
  const height = 60
  const backgroundColor = ctx.fillStyle
  ctx.fillRect(0, canvas.height - height - scale, canvas.width, scale)
  ctx.fillStyle = '#757161'
  ctx.fillRect(0, canvas.height - height, canvas.width, height)
  ctx.fillStyle = backgroundColor

  function drawBar (current, max, isLeft, fullSprite, emptySprite) {
    let x = tileSize * scale * 1.5 + (isLeft ? 0 : canvas.width / 2)
    let y = canvas.height - height / 2
    for (let i = 0; i < max / 10; i++) {
      const sprite = i < current / 10 ? fullSprite : emptySprite
      drawSprite(sprite, x, y, false, true)
      x += tileSize * scale / 2
    }
  }
  // drawBar(player.ammo, player.maxAmmo, true, smallSprite, smallSprite + 1)
  const sOffset = (player.healthBarFlashTimer > 0 && Math.floor(player.healthBarFlashTimer / 10) % 2 === 0) ? 8 : 2
  drawBar(player.health, player.maxHealth, false, smallSprite + sOffset, smallSprite + sOffset + 1)

  // Goal text
  const signsLeft = ents.filter(s => s.isSign).length
  ctx.fillText('Destroy all signposts! ' + signsLeft + " remain.", 30, canvas.height - 20)
  if (signsLeft === 0) player.winner = true
}

function drawParticle (p) {
  const type = particleTypes[p.type]
  //if (p.type. === 'ring') drawCheckpoint(p, false, true)
  drawSprite(type.sprite, p.x, p.y)
}

function drawShot (s) {
  drawSprite(s.hurtsPlayer ? smallSprite : smallSprite + 6, s.pos.x, s.pos.y)
}

function drawPlayer (player) {
  for (let bit of player.trail) {
    drawCheckpoint(bit, false)
  }

  if (!player.dead) {
    let sprite = 5
    drawSprite(sprite, player.pos.x, player.pos.y, player.facingLeft)
    // ctx.strokeText(Math.floor(player.pos.x / tileSize) + ":" + Math.floor(player.pos.y / tileSize), 40, 40)
  }
}

function drawSprite (index, x, y, flipped = false, hud = false) {
  let width = tileSize
  let height = tileSize
  if (!hud) {
    const camPos = camera.pos
    x = Math.floor((x - camPos.x) * scale)
    y = Math.floor((y - camPos.y) * scale)
    x += Math.floor(canvas.width / 2)
    y += Math.floor(canvas.height / 2)
  }
  ctx.translate(x, y)
  if (flipped) ctx.scale(-1, 1)

  let sX = (index % 8) * width
  let sY = Math.floor(index / 8) * height

  // hack for small sprites
  if (index >= smallSprite) {
    const smolIndex = index - smallSprite
    width /= 2
    height /= 2
    sX = smolIndex * width
    sY = 48
  }

  ctx.drawImage(spriteImage,
    sX, sY,
    width, height,
    -width / 2 * scale, -height / 2 * scale,
    width * scale, height * scale)
  if (flipped) ctx.scale(-1, 1)
  ctx.translate(-x, -y)
}

const hiddenSprites = [15, 16, 17, 2, 8]

function drawLevel () {
  const level = world.map
  const center = { x: camera.pos.x / tileSize, y: camera.pos.y / tileSize }
  const halfWidth = canvas.width / 2 / scale / tileSize
  const halfHeight = canvas.height / 2 / scale / tileSize
  const minY = Math.floor(center.y - halfHeight)
  const maxY = Math.floor(center.y + halfHeight + 1)
  const minX = Math.floor(center.x - halfWidth)
  const maxX = Math.floor(center.x + halfWidth + 1)
  for (let tY = minY; tY < maxY; tY++) {
    for (let tX = minX; tX < maxX; tX++) {
      const i = tX + tY * world.width
      const x = (i % world.width) + 0.5
      const y = Math.floor(i / world.width) + 0.5
      const sprite = level[i]
      if (!window.editMode && hiddenSprites.indexOf(sprite) >= 0) {
        drawSprite(0, x * tileSize, y * tileSize)
      } else {
        drawSprite(sprite, x * tileSize, y * tileSize)
      }
    }
  }
  for (let checkpoint of checkpoints) {
    drawCheckpoint({ x: checkpoint.x * tileSize, y: checkpoint.y * tileSize }, player.checkpoints[checkpoint.id])
  }
}

function drawCheckpoint (pos, isVacant) {
  const isFast = player.isCharging
  let anim = Math.floor(frame / (isFast ? 6 : 12)) % 4
  if (anim === 3) anim = 1
  if (isVacant) return
  const sprite = 8 + anim
  drawSprite(sprite, pos.x, pos.y)
}

function updatePlayerAxis (player, axis, moreKey, lessKey, maxVel) {
  let vel = player.vel[axis]

  if (moreKey) {
    if (vel < maxVel) {
      vel += xAccel
    } else {
      vel -= Math.min(vel - maxVel, xDecel)
    }
  } else if (lessKey) {
    if (vel > -maxVel) {
      vel -= xAccel
    } else {
      vel += Math.min(-vel - maxVel, xDecel)
    }
  } else if (!lessKey && vel < 0) vel += Math.min(-vel, xDecel)
  else if (!moreKey && vel > 0) vel -= Math.min(vel, xDecel)

  player.vel[axis] = vel
}

function updatePlayer (player, isLocal) {
  if (player.dead) {
    if (isLocal) {
      player.deadTimer = player.deadTimer ? player.deadTimer + 1 : 1
      if (player.deadTimer > 60 * 5) restart()
    }
    return
  }

  const keys = player.keys
  let isTouching = false

  if (keys.left) player.facingLeft = true
  if (keys.right) player.facingLeft = false

  updatePlayerAxis(player, 'x', keys.right, keys.left, skyXVel)
  player.pos.x += player.vel.x

  const collidingTile = getCollidingTiles(player.pos)
  if (collidingTile !== null) {
    isTouching = true
    const clearTileIndex = getIndexFromPixels(collidingTile.x, collidingTile.y) +
      (player.vel.x < 0 ? 1 : -1) // move player one tile left or right
    const { x: clearX } = getPixelsFromIndex(clearTileIndex)
    player.pos.x = clearX + tileSize / 2
    player.vel.x = 0
  }

  updatePlayerAxis(player, 'y', keys.down, keys.up, skyYVel)
  player.pos.y += player.vel.y

  const collidingTileY = getCollidingTiles(player.pos)
  if (collidingTileY !== null) {
    isTouching = true
    const clearTileIndex = getIndexFromPixels(collidingTileY.x, collidingTileY.y) +
      (player.vel.y < 0 ? world.width : -world.width) // move player one tile up or down
    const { y: clearY } = getPixelsFromIndex(clearTileIndex)
    player.pos.y = clearY + tileSize / 2
    player.vel.y = 0
  }

  if (player.fireTimer > 0) player.fireTimer--

  if (isLocal) {
    if (player.healthBarFlashTimer > 0) {
      player.healthBarFlashTimer--
    }

    if (player.winner) {
      spawnExplosion(player.pos)
    }

    camera.pos.x = player.pos.x
    camera.pos.y = player.pos.y

    if (keys.shoot && player.fireTimer === 0 && player.ammo > 0) {
      spawnShot(player)
      player.fireTimer = player.refireRate
      // player.ammo--
    }
    keys.shootHit = false

    // checkpoints
    for (let checkpoint of checkpoints) {
      const close = tileSize * 1.5
      const dist = distance(player.pos, tilePosToWorld(checkpoint))
      if (dist < close && !player.checkpoints[checkpoint.id]) {
        player.checkpoints[checkpoint.id] = true
        // player.trail.push({ x: checkpoint.x * tileSize, y: checkpoint.y * tileSize, xVel: 0, yVel: 0 })

        player.health = player.maxHealth
        player.healthBarFlashTimer = 120

        /* // Did I win?
        if (checkpoints.every(cp => player.checkpoints[cp.id])) {
          console.log('you just won the game')
          player.megaBird = true
        } */
      }
    }
  }

  /* if (player.megaBird && frame % 10 === 0) {
    const p = { x: player.pos.x, y: player.pos.y, age: 0, type: 'firework0' }
    const angle = (frame / 10) / 12 * Math.PI * 2
    const force = 1.4
    p.xVel = force * Math.cos(angle)
    p.yVel = force * Math.sin(angle)
    particles.push(p)
  } */

  if (player.lostCoins) {
    player.checkpoints = {}
    console.log('coins lost: ' + player.trail.length)
    for (let bit of player.trail) {
      particles.push(bit)
      bit.type = 'expPuff'
      bit.age = 0
      bit.xVel *= 2
      bit.yVel *= 2
      bit.xVel += (Math.random() - 0.5) * 4
      bit.yVel += (Math.random() - 0.5) * 4
    }
    player.trail.length = 0
  }
  delete player.lostCoins

  if (isLocal) {
    if (player.trail.length > 0) {
      if (isTouching) {
        player.lostCoins = true // for network updates
      }
    }
  }
  if (player.trail.length > 0) {
    let pos = { ...player.pos }
    for (let bit of player.trail) {
      const dist = getDist(bit, pos)
      const angle = getAngle(bit, pos)
      const force = 0.1 * dist
      bit.xVel = force * Math.cos(angle)
      bit.yVel = force * Math.sin(angle)
      pos.x = bit.x
      pos.y = bit.y
      bit.x += bit.xVel
      bit.y += bit.yVel
    }
  }
  if (isLocal) send(JSON.stringify(player))
}

function spawnShot (ent) {
  if (!ent.fireMode) {
    const shot = {
      pos: { x: ent.pos.x, y: ent.pos.y },
      vel: { x: 0, y: 0 }
    }
    shot.vel.x = ent.facingLeft ? -8 : 8
    shot.hurtsPlayer = false
    shot.age = 0
    shots.push(shot)
  }
  if (ent.fireMode === 'star') {
    let points = 5
    const offset = (ent.fireSequence / 16) * Math.PI * 2 / points
    for (let i = 0; i < 5; i++) {
      const shot = {
        pos: { x: ent.pos.x, y: ent.pos.y },
        vel: { x: 0, y: 0 }
      }
      const angle = Math.PI * 2 / points * i + offset
      const force = 1.4
      shot.vel.x = Math.cos(angle) * force
      shot.vel.y = Math.sin(angle) * force
      shot.hurtsPlayer = true
      shot.age = 0
      shots.push(shot)
    }
    ent.fireSequence = (ent.fireSequence + 1) % 16
  }
}

function getDist (pos1, pos2) {
  const xDist = pos1.x - pos2.x
  const yDist = pos1.y - pos2.y
  const dist = Math.sqrt(xDist * xDist + yDist * yDist)
  return dist
}

function getAngle (pos1, pos2) {
  return Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x)
}

function onMessage (msg) {
  if (msg.type === 'events') {
    for (let event of msg.data) {
      let id = event.id
      if (netState[id]) {
        netState[id].lostCoins = true
      }
    }
  } else if (msg.id !== undefined) {
    localId = msg.id
    console.log('got local id: ' + localId)
  } else {
    netState = msg
    for (const id in netState) {
      // netState[id] = JSON.parse(netState[id])
    }
  }
}

export const game = {
  start: start,
  onMessage: onMessage
}

/**
 * Returns true if you should preventDefault
 * @param {*} key 
 * @param {*} state 
 */
function switchKey (key, state) {
  switch (key) {
    case 'ArrowLeft':
    case 'a':
      keys.left = state
      break
    case 'ArrowRight':
    case 'd':
      keys.right = state
      break
    case 'ArrowUp':
    case 'w':
      keys.up = state
      break
    case 'ArrowDown':
    case 's':
      keys.down = state
      break
    case 'q':
      keys.cheat = state
      break
    case ' ':
    case 'x':
    case '/':
      if (!keys.shoot && state === true) keys.shootHit = true
      keys.shoot = state
      break
    case 'l':
      // hack for cheatmode
      if (state === false && keys.cheat) {
        player.cheatMode = !player.cheatMode
      }
      break
    default:
      return false
  }
  return true
}

window.addEventListener('keydown', function (e) {
  const preventDefault = switchKey(e.key, true)
  if (preventDefault) e.preventDefault()
})

window.addEventListener('keyup', function (e) {
  switchKey(e.key, false)
})

function getIndexFromPixels (x, y) {
  if (x < 0 || y < 0 || x >= world.width * tileSize || y >= world.height * tileSize) return -1
  return Math.floor((y / tileSize)) * world.width + Math.floor((x / tileSize))
}

function getPixelsFromIndex (i) {
  return { x: (i % world.width) * tileSize, y: Math.floor(i / world.width) * tileSize }
}

function isGrounded (ent) {
  return !!getCollidingTiles({ x: ent.pos.x, y: ent.pos.y + 0.1 })
}

function getCollidingTiles (pos) {
  const { x, y } = pos
  const halfTile = tileSize / 2
  const tilesToCheck = [
    [ -halfTile, -halfTile, 'topLeft' ],
    [ halfTile - 0.001, -halfTile, 'topRight' ],
    [ -halfTile, halfTile - 0.001, 'bottomLeft' ],
    [ halfTile - 0.001, halfTile - 0.001, 'bottomRight' ]
  ]
  for (const [xOffset, yOffset] of tilesToCheck) {
    const tileX = Math.floor(x + xOffset)
    const tileY = Math.floor(y + yOffset)
    const tileIndex = getIndexFromPixels(tileX, tileY)
    const tile = world.map[tileIndex]
    if (tile > 0 && hiddenSprites.indexOf(tile) === -1) {
      return { x: tileX, y: tileY }
    }
  }
  return null
}

function restart () {
  frame = 0
  shots.length = 0
  ents.length = 0
  // netState
  player = new Player(90, 90)
  player.keys = keys

  const level = world.map
  let cId = 0
  for (let tY = 0; tY < world.height; tY++) {
    for (let tX = 0; tX < world.height; tX++) {
      const i = tX + tY * world.width
      const x = (i % world.width) + 0.5
      const y = Math.floor(i / world.width) + 0.5
      const sprite = level[i]
      if (sprite === 8) {
        checkpoints.push({ id: cId++, x, y })
      }
      if (sprite === 2) {
        ents.push(new OhSpawner(x * tileSize, y * tileSize))
      }
      if (sprite === 15) {
        ents.push(new BatSpawner(x * tileSize, y * tileSize))
      }
      if (sprite === 17) {
        ents.push(new SignPost(x * tileSize, y * tileSize))
      }
    }
  }
  console.log(checkpoints)
}

restart()

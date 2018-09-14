import * as Express from "express"
import { getLogger } from 'log4js'
import * as morgan from 'morgan'
import * as bodyparser from 'body-parser'
import { IHyconWallet } from "./interfaces";
import * as request from 'request-promise-native'
import { DB } from "./db";
import { Wallet } from "../../src/wallet/wallet"
import axios from 'axios'

const logger = getLogger('server')

export class Server {
  app: Express.Application
  router: Express.Router
  db: DB
  host = "0.0.0.0"
  port = 9999
  apiUrl = 'http://localhost:2442/api/v1'

  constructor() {
    this.app = Express()
    this.app.use(morgan('dev'))
    this.app.use(bodyparser.json())
    this.app.use(bodyparser.urlencoded({ extended: true }))
    this.app.use('/', this.route())

    this.db = new DB()
  }

  private async dupleNickname(nickname) {
    const dupl = await this.db.singleQuery(
      "SELECT * FROM address WHERE name=?",
      [nickname])

    if (dupl.length > 0) {
      return true
    }
  }

  private async saveAddress(nickname, address) {
    try {
      await this.db.singleQuery('INSERT INTO address (address, name) VALUES (?, ?)', [address, nickname])
    } catch (e) {
      throw false
    }
  }

  private route(): Express.Router {
    const router = Express.Router()

    router.post('/wallet', async (req, res) => {
      const password: string = req.body.password
      const nickname: string = req.body.nickname

      if (await this.dupleNickname(nickname)) {
        console.log("nickname duplicated")
        res.json({ error: "nickname duplicated" })
        return
      }

      axios.post(`${this.apiUrl}/wallet`)
        .then(resp => {
          this.saveAddress(nickname, resp.data.address)
          res.json({
            address: resp.data.address,
            mnemonic: resp.data.mnemonic,
            privateKey: Wallet.encryptAES(String(password), String(resp.data.privateKey))
          })
        })
    })

    router.post('/wallet/recover', async (req, res) => {
      const password = req.body.password
      const nickname = req.body.nickname
      const mnemonic = req.body.mnemonic

      if (await this.dupleNickname(nickname)) {
        res.json({ error: "nickname duplicated" })
        return
      }

      const basic = await axios.post(`${this.apiUrl}/wallet`, { mnemonic: mnemonic })
      const privateKey = Wallet.encryptAES(String(password), String(basic.data.privateKey))
      const address = basic.data.address

      await this.saveAddress(nickname, address)

      res.json({
        privateKey: privateKey,
        address: address
      })
    })

    router.get('/wallet/:address', async (req, res) => {
      const result1 = await this.db.singleQuery('SELECT * FROM address WHERE address=?', [req.params.address])
      const result2 = await this.db.singleQuery('SELECT * FROM address WHERE name=?', [req.params.name])

      let target

      if (result1.length) {
        target = result1[0].address
      }
      else if (result2.length) {
        target = result2[0].address
      }
      else {
        res.json({ error: 'not exist' })
        return
      }

      const resp = await axios.get(`${this.apiUrl}/wallet/${target}/balance`)
      const hyc = await axios.get('https://api.coinmarketcap.com/v2/ticker/?convert=HYC&limit=1')
      const bitusd = hyc.data.data['1'].quotes.USD.price
      const hycbit = hyc.data.data['1'].quotes.HYC.price
      const hycPrice = 1 / (hycbit / bitusd)
      const balance = resp.data.status === 404 ? 0 : resp.data
      res.json({
        hyconPrice: hycPrice * 1100,
        balance: balance,
        krw: hycPrice * 1100 * balance
      })
    })

    router.post('/tx', async (req, res) => {
      console.log(req.body.privateKey)
      const privateKey = Wallet.decryptAES(String(req.body.password), Buffer.from(String(":" + req.body.privateKey)))
      console.log(privateKey)
      axios.post(`${this.apiUrl}/signedtx`, {
        to: req.body.to,
        amount: req.body.amount,
        fee: req.body.fee,
        nonce: req.body.nonce,
        privateKey: privateKey
      }).then(data => {
        res.json(data.data)
      }).catch(e => {
        res.json({ error: "send tx fail" })
      })
    })

    router.get('/wallet/:address/txs', async (req, res) => {
      const address = req.params.address

      axios.get(`${this.apiUrl}/wallet/${address}/txs`)
        .then(data => {
          if (data.data.status) {
            res.json([])
          }
          else {
            res.json(data.data)
          }
        })
        .catch(e => {
          res.json({ error: "get txs fail" })
        })
    })
    return router
  }

  public start(): void {
    this.app.listen(this.port, this.host, () => {
      logger.info(`Server is running... ${this.host}:${this.port}`)
      console.log(`Server is running... ${this.host}:${this.port}`)
    })
  }
}
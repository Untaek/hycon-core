import * as mysql from 'mysql'

export class DB {
  config: mysql.PoolConfig = {
    connectionLimit: 10,
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'a123456',
    multipleStatements: true,
    database: 'db',
  }
  pool: mysql.Pool

  constructor() {
    this.pool = mysql.createPool(this.config)
    this.init()
  }

  private init() {
    const query = `
      DROP TABLE IF EXISTS address;
      CREATE TABLE IF NOT EXISTS address (
        id int NOT NULL AUTO_INCREMENT,
        address varchar(33) NOT NULL,
        name varchar(20) NOT NULL,
        PRIMARY KEY(id)
      );
      
    `
    this.singleQuery(query)
  }

  public transaction(): Promise<mysql.PoolConnection> {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, conn) => {
        if (err) {
          this.pool.releaseConnection(conn)
          reject(err)
        }
        resolve(conn)
      })
    })
  }

  public begin(conn: mysql.PoolConnection, query: string, args: string[]) {
    return new Promise((resolve, reject) => {
      conn.query(query, args, (err, result) => {
        if (err) {
          conn.rollback(() => {
            reject(err)
          })
        }
        resolve(result)
      })
    })
  }

  public commit(conn: mysql.PoolConnection) {
    return new Promise((resolve, reject) => {
      conn.commit((err) => {
        if (err) {
          conn.rollback(() => {
            reject(err)
          })
        }
        resolve()
      })
    })
  }

  public release(conn: mysql.PoolConnection) {
    conn.release()
  }

  public singleQuery(query: string, args?: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((err, conn) => {
        if (err) reject(err)

        conn.query(query, args, (err, result) => {
          conn.release()
          if (err) reject(err)

          resolve(result)
        })
      })
    })
  }
}
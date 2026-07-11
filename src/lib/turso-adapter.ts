/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Turso (libSQL) 适配器
 *
 * 将 @libsql/client API 转换为与 D1 兼容的接口
 * Turso 基于 libSQL（SQLite 开源分支），SQL 语法与 D1/SQLite 完全兼容
 *
 * 适用于 EdgeOne Pages 等无内置数据库的边缘平台
 *
 * 注意：此模块仅在服务端使用，通过 webpack 配置排除客户端打包
 */

import { createClient, type Client } from '@libsql/client';
import { DatabaseAdapter, D1PreparedStatement, D1Result } from './d1-adapter';

/**
 * Turso 适配器
 *
 * 使用 @libsql/client 包装为 D1 兼容接口
 */
export class TursoAdapter implements DatabaseAdapter {
  private client: Client;

  constructor(url: string, authToken: string) {
    this.client = createClient({
      url,
      authToken,
    });
  }

  prepare(query: string): D1PreparedStatement {
    return new TursoPreparedStatement(this.client, query);
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    // Turso/libSQL 原生支持 batch
    const libsqlStatements = statements.map(
      (stmt) => (stmt as TursoPreparedStatement).toLibSQLBatch()
    );
    const results = await this.client.batch(libsqlStatements, 'write');
    return results.map((result) => ({
      success: true,
      results: result.rows || [],
      meta: {
        changes: result.rowsAffected,
        last_row_id:
          result.lastInsertRowid !== undefined
            ? Number(result.lastInsertRowid)
            : null,
      },
    }));
  }

  async exec(query: string): Promise<void> {
    await this.client.executeMultiple(query);
  }
}

/**
 * Turso PreparedStatement 包装器
 * 将 @libsql/client API 转换为 D1 兼容 API
 */
class TursoPreparedStatement implements D1PreparedStatement {
  private params: any[] = [];

  constructor(
    private client: Client,
    private query: string
  ) {}

  bind(...values: any[]): D1PreparedStatement {
    this.params = values;
    return this;
  }

  /**
   * 执行查询并返回第一行
   */
  async first<T = any>(colName?: string): Promise<T | null> {
    try {
      const result = await this.client.execute({
        sql: this.query,
        args: this.params,
      });

      if (!result.rows || result.rows.length === 0) return null;

      const row = result.rows[0];
      if (colName) return (row as any)[colName] ?? null;

      return row as T;
    } catch (err) {
      console.error('Turso first() error:', err);
      return null;
    }
  }

  /**
   * 执行查询并返回结果
   */
  async run<T = any>(): Promise<D1Result<T>> {
    try {
      const result = await this.client.execute({
        sql: this.query,
        args: this.params,
      });

      return {
        success: true,
        meta: {
          changes: result.rowsAffected,
          last_row_id:
            result.lastInsertRowid !== undefined
              ? Number(result.lastInsertRowid)
              : null,
        },
        results: result.rows as T[],
      };
    } catch (err: any) {
      console.error('Turso run() error:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 执行查询并返回所有行
   */
  async all<T = any>(): Promise<D1Result<T>> {
    try {
      const result = await this.client.execute({
        sql: this.query,
        args: this.params,
      });

      return {
        success: true,
        results: (result.rows || []) as T[],
      };
    } catch (err: any) {
      console.error('Turso all() error:', err);
      return {
        success: false,
        error: err.message,
        results: [],
      };
    }
  }

  /**
   * 转换为 libSQL batch 格式
   */
  toLibSQLBatch(): { sql: string; args: any[] } {
    return { sql: this.query, args: this.params };
  }
}

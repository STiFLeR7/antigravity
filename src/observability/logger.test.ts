/**
 * @fileoverview Unit tests for Logger
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, ConsoleTransport, MemoryTransport } from './logger.js';
import { Severity, createUniqueId } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

describe('Logger', () => {
  let memoryTransport: MemoryTransport;
  let logger: Logger;

  beforeEach(() => {
    memoryTransport = new MemoryTransport(100);
    logger = new Logger({
      minLevel: Severity.DEBUG,
      transports: [memoryTransport],
      module: 'test',
      includeTimestamp: true,
    });
  });

  describe('logging levels', () => {
    it('should log DEBUG messages', () => {
      logger.debug('debug message', { key: 'value' });
      
      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(Severity.DEBUG);
      expect(entries[0].message).toBe('debug message');
    });

    it('should log INFO messages', () => {
      logger.info('info message');
      
      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(Severity.INFO);
    });

    it('should log WARN messages', () => {
      logger.warn('warn message');
      
      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(Severity.WARN);
    });

    it('should log ERROR messages', () => {
      logger.error('error message');
      
      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(Severity.ERROR);
    });

    it('should log ERROR messages with error object', () => {
      const error = new Error('test error');
      logger.error('error message', {}, error);
      
      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].error).not.toBeNull();
      expect(entries[0].error?.message).toBe('test error');
    });
  });

  describe('level filtering', () => {
    it('should filter messages below minimum level', () => {
      const warnLogger = new Logger({
        minLevel: Severity.WARN,
        transports: [memoryTransport],
        module: 'test',
        includeTimestamp: true,
      });

      warnLogger.debug('debug');
      warnLogger.info('info');
      warnLogger.warn('warn');
      warnLogger.error('error');

      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe(Severity.WARN);
      expect(entries[1].level).toBe(Severity.ERROR);
    });
  });

  describe('child loggers', () => {
    it('should create child logger', () => {
      const child = logger.child({ module: 'submodule' });
      child.info('child message');

      const entries = memoryTransport.getEntries();
      expect(entries).toHaveLength(1);
    });

    it('should inherit parent transports', () => {
      const child = logger.child({ module: 'submodule' });
      child.info('message');

      expect(memoryTransport.getEntries()).toHaveLength(1);
    });
  });

  describe('MemoryTransport', () => {
    it('should respect max entries limit', () => {
      const smallTransport = new MemoryTransport(3);
      const smallLogger = new Logger({
        minLevel: Severity.DEBUG,
        transports: [smallTransport],
        module: 'test',
        includeTimestamp: true,
      });

      smallLogger.info('message 1');
      smallLogger.info('message 2');
      smallLogger.info('message 3');
      smallLogger.info('message 4');

      const entries = smallTransport.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0].message).toBe('message 2');
      expect(entries[2].message).toBe('message 4');
    });

    it('should clear entries', () => {
      logger.info('message');
      expect(memoryTransport.getEntries()).toHaveLength(1);
      
      memoryTransport.clear();
      expect(memoryTransport.getEntries()).toHaveLength(0);
    });
  });

  describe('correlation IDs', () => {
    it('should support setting correlation ID in config', () => {
      const correlationId = createUniqueId(uuidv4());
      const correlatedLogger = new Logger({
        minLevel: Severity.DEBUG,
        transports: [memoryTransport],
        module: 'test',
        includeTimestamp: true,
        defaultCorrelationId: correlationId,
      });
      
      correlatedLogger.info('correlated message');

      const entries = memoryTransport.getEntries();
      expect(entries[0].correlationId).toBe(correlationId);
    });
  });
});

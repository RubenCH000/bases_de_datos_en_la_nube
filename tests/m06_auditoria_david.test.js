const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { registrarAuditoria } = require('../src/db/auditLog');

describe('M06 - Pruebas de Auditoría y Recuperación (David)', () => {
    const ts = Date.now();

    test('1. Caso normal: registra exitosamente una acción en el audit_log', async () => {
        const idActor = `user_normal_${ts}`;
        const log = await registrarAuditoria(idActor, 'INSERT', `doc_${ts}`, 'SUCCESS');
        
        assert.equal(log.actor, idActor);
        assert.equal(log.action, 'INSERT');
        assert.equal(log.status, 'SUCCESS');
    });

    test('2. Caso límite 1: registra auditoría con metadatos vacíos', async () => {
        const idActor = `user_limite1_${ts}`;
        const log = await registrarAuditoria(idActor, 'UPDATE', `doc_limite_${ts}`, 'SUCCESS', {});
        
        assert.equal(log.actor, idActor);
        assert.deepEqual(log.metadata, {});
    });

    test('3. Caso límite 2: maneja campos de auditoría extremadamente largos', async () => {
        const actorLargo = 'a'.repeat(256);
        const log = await registrarAuditoria(actorLargo, 'DELETE', `doc_largo_${ts}`, 'FAILED');
        
        assert.equal(log.actor, actorLargo);
        assert.equal(log.action, 'DELETE');
    });

    test('4. Fallo declarado: rechaza registrar auditoría si falta el actor', async () => {
        await assert.rejects(
            async () => await registrarAuditoria(null, 'INSERT', 'doc_123', 'SUCCESS'),
            Error
        );
    });
});
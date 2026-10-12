const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { registrarAuditoria, listarAuditoria } = require('../src/db/auditLog');

describe('M06 - Pruebas de Auditoría y Recuperación (David)', () => {
    const ts = Date.now();

    test('1. Caso normal: registra exitosamente una acción en el audit_log', async () => {
        const actor = `user_normal_${ts}`;
        const log = await registrarAuditoria({
            actor,
            accion: 'INSERT',
            documentosAfectados: 1,
            resultado: 'exito',
        });

        assert.equal(log.actor, actor);
        assert.equal(log.accion, 'INSERT');
        assert.equal(log.documentos_afectados, 1);
        assert.equal(log.resultado, 'exito');

        // Se comprueba que realmente quedó guardado en DynamoDB.
        const guardados = await listarAuditoria();
        assert.ok(guardados.some((registro) => registro.audit_id === log.audit_id));
    });

    test('2. Caso límite 1: registra auditoría con cero documentos afectados', async () => {
        const actor = `user_limite1_${ts}`;
        const log = await registrarAuditoria({
            actor,
            accion: 'UPDATE',
            documentosAfectados: 0,
            resultado: 'exito',
        });

        assert.equal(log.actor, actor);
        assert.equal(log.documentos_afectados, 0);
    });

    test('3. Caso límite 2: maneja campos de auditoría extremadamente largos', async () => {
        const actorLargo = 'a'.repeat(256);
        const log = await registrarAuditoria({
            actor: actorLargo,
            accion: 'DELETE',
            documentosAfectados: 1,
            resultado: 'fallo',
        });

        assert.equal(log.actor, actorLargo);
        assert.equal(log.accion, 'DELETE');
        assert.equal(log.resultado, 'fallo');
    });

    test('4. Fallo declarado: rechaza registrar auditoría si falta el actor', async () => {
        await assert.rejects(
            () => registrarAuditoria({
                actor: '',
                accion: 'INSERT',
                documentosAfectados: 1,
                resultado: 'exito',
            }),
            /actor/,
        );
    });
});
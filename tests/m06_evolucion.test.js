const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../src/db/cdrlFixtures');
const { validarEvento } = require('../src/db/eventoValidador');
const { normalizarEvento, resumirVersiones, VersionNoSoportadaError } = require('../src/db/eventoLector');
const {
    guardarEvento,
    obtenerEvento,
    obtenerEventoNormalizado,
    consultarPorDispositivoNormalizado,
    EventoInvalidoError,
} = require('../src/db/documentStore');

describe('M06 - Evolución del documento de evento (v1 y v2)', () => {
    const ts = Date.now();

    test('1. Caso normal: los fixtures v1 y v2 son válidos y se leen con la misma forma', () => {
        for (const evento of fixtures.mixtos) {
            const { valido, errores } = validarEvento(evento);
            assert.equal(valido, true, errores.join('; '));
        }

        const v1 = normalizarEvento(fixtures.v1[0]);
        const v2 = normalizarEvento(fixtures.v2[0]);
        assert.deepEqual(Object.keys(v1).sort(), Object.keys(v2).sort());
        assert.equal(v1.version_origen, 1);
        assert.equal(v1.firmware_version, null);
        assert.equal(v1.quality_score, null);
        assert.equal(v2.version_origen, 2);
        assert.equal(v2.quality_score, 0.97);
        assert.deepEqual(resumirVersiones(fixtures.mixtos), { v1: 4, v2: 2 });
    });

    test('2. Caso límite: quality_score acepta exactamente 0 y 1, pero no 1.01', () => {
        const base = { ...fixtures.v2[0], event_id: 'evt_limite_score' };
        assert.equal(validarEvento({ ...base, quality_score: 0 }).valido, true);
        assert.equal(validarEvento({ ...base, quality_score: 1 }).valido, true);

        const fuera = validarEvento({ ...base, quality_score: 1.01 });
        assert.equal(fuera.valido, false);
        assert.match(fuera.errores.join(';'), /quality_score/);
    });

    test('3. Caso límite: un v1 con campos de v2 se rechaza y un v1 con schema_version 1 explícito se acepta', () => {
        const v1ConCamposNuevos = { ...fixtures.v1[0], quality_score: 0.5 };
        const resultado = validarEvento(v1ConCamposNuevos);
        assert.equal(resultado.valido, false);
        assert.match(resultado.errores.join(';'), /campos no permitidos en schema_version 1: quality_score/);

        const v1Explicito = { ...fixtures.v1[0], schema_version: 1 };
        assert.equal(validarEvento(v1Explicito).valido, true);
        assert.equal(normalizarEvento(v1Explicito).version_origen, 1);
    });

    test('4. Fallo declarado: schema_version desconocida o v2 incompleto no se aceptan', async () => {
        const v3 = { ...fixtures.v2[0], schema_version: 3 };
        assert.equal(validarEvento(v3).valido, false);
        assert.throws(() => normalizarEvento(v3), VersionNoSoportadaError);

        const v2SinFirmware = { ...fixtures.v2[0], event_id: `evt_v2_incompleto_${ts}` };
        delete v2SinFirmware.firmware_version;
        await assert.rejects(() => guardarEvento(v2SinFirmware), EventoInvalidoError);
        assert.equal(await obtenerEvento(v2SinFirmware.event_id), null);
    });

    test('5. Coexistencia en DynamoDB: un v1 y un v2 del mismo dispositivo se guardan y se leen normalizados', async () => {
        const dispositivo = `NODE-CDRL-M06${String(ts).slice(-6)}`;
        const v1 = { ...fixtures.v1[0], event_id: `evt_m06_v1_${ts}`, device_id: dispositivo, timestamp: ts };
        const v2 = { ...fixtures.v2[0], event_id: `evt_m06_v2_${ts}`, device_id: dispositivo, timestamp: ts + 1 };

        assert.equal((await guardarEvento(v1)).creado, true);
        assert.equal((await guardarEvento(v2)).creado, true);

        // El documento v1 se queda como se guardó; solo cambia la forma al leerlo.
        const guardadoV1 = await obtenerEvento(v1.event_id);
        assert.equal(guardadoV1.schema_version, undefined);

        const leidoV1 = await obtenerEventoNormalizado(v1.event_id);
        assert.equal(leidoV1.version_origen, 1);
        assert.equal(leidoV1.quality_score, null);

        const eventos = await consultarPorDispositivoNormalizado(dispositivo);
        assert.equal(eventos.length, 2);
        assert.deepEqual(eventos.map((e) => e.version_origen), [1, 2]);
        assert.ok(eventos.every((e) => e.schema_version === 2));
    });
});

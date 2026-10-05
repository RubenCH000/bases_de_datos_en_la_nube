const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { guardarEvento, obtenerEvento, EventoDuplicadoError, EventoInvalidoError } = require('../src/db/documentStore');
const { validarEvento } = require('../src/db/eventoValidador');

describe('M05 - Pruebas de Almacén Documental (DynamoDB)', () => {
    // Generamos un timestamp base para evitar colisiones en la base de datos
    const ts = Date.now();

    test('1. Caso normal: inserta un documento válido en el almacén', async () => {
        const eventoValido = {
            event_id: `evt_normal_${ts}`,
            device_id: 'NODE-CDRL-TEST1',
            timestamp: ts,
            metric_name: 'cpu_temperature',
            metric_value: 45.5
        };

        const { valido } = validarEvento(eventoValido);
        assert.equal(valido, true);

        const resultado = await guardarEvento(eventoValido);
        assert.equal(resultado.creado, true);
        assert.equal(resultado.duplicado, false);
    });

    test('2. Caso duplicado: lanza error al insertar un event_id con contenido distinto', async () => {
        const idDuplicado = `evt_duplicado_${ts}`;
        const evento1 = {
            event_id: idDuplicado,
            device_id: 'NODE-CDRL-TEST2',
            timestamp: ts,
            metric_name: 'battery_voltage',
            metric_value: 12.5
        };

        const eventoDistinto = {
            ...evento1,
            metric_value: 10.0 // Valor alterado
        };

        // Primera inserción
        await guardarEvento(evento1);

        // Segunda inserción debe rechazar con EventoDuplicadoError
        await assert.rejects(
            async () => await guardarEvento(eventoDistinto),
            EventoDuplicadoError
        );
    });

    test('3. Evento que no existe: retorna nulo al buscar por ID', async () => {
        const resultado = await obtenerEvento(`evt_inexistente_${ts}`);
        assert.equal(resultado, null);
    });

    test('4. Fallo declarado: rechaza un documento inválido', async () => {
        const eventoInvalido = {
            event_id: 'formato-incorrecto', 
            metric_name: 'presion',         
            metric_value: 'no-es-numero'    
        };

        const { valido, errores } = validarEvento(eventoInvalido);
        assert.equal(valido, false);
        assert.ok(errores.length > 0);

        await assert.rejects(
            async () => await guardarEvento(eventoInvalido),
            EventoInvalidoError
        );
    });
});
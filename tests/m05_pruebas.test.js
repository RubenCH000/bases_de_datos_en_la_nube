const { guardarEvento, obtenerEvento, EventoDuplicadoError, EventoInvalidoError } = require('../src/db/documentStore');
const { validarEvento } = require('../src/db/eventoValidador');

describe('M05 - Pruebas de Almacén Documental (DynamoDB)', () => {
    // Generamos un timestamp base para evitar colisiones en ejecuciones consecutivas
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
        expect(valido).toBe(true);

        const resultado = await guardarEvento(eventoValido);
        expect(resultado.creado).toBe(true);
        expect(resultado.duplicado).toBe(false);
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
            metric_value: 10.0 // Contenido distinto para forzar el EventoDuplicadoError
        };

        // Primera inserción exitosa
        await guardarEvento(evento1);

        // Segunda inserción lanza el error personalizado de Ángeles
        await expect(guardarEvento(eventoDistinto)).rejects.toThrow(EventoDuplicadoError);
    });

    test('3. Evento que no existe: retorna nulo al buscar por ID', async () => {
        const resultado = await obtenerEvento(`evt_inexistente_${ts}`);
        expect(resultado).toBeNull();
    });

    test('4. Fallo declarado: rechaza un documento inválido', async () => {
        const eventoInvalido = {
            event_id: 'formato-incorrecto', // No cumple la regex evt_
            metric_name: 'presion',         // No está en METRICAS_PERMITIDAS
            metric_value: 'no-es-numero'    // Tipo de dato incorrecto
            // Faltan campos requeridos como device_id y timestamp
        };

        const { valido, errores } = validarEvento(eventoInvalido);
        expect(valido).toBe(false);
        expect(errores.length).toBeGreaterThan(0);

        // Al intentar guardarlo, debe rechazarlo inmediatamente
        await expect(guardarEvento(eventoInvalido)).rejects.toThrow(EventoInvalidoError);
    });
});
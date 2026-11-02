// Demuestra una política insegura y su remediación para M09.

const fs = require('node:fs');
const path = require('node:path');

const {
    eliminarEvento,
} = require('../src/db/documentStore');

const {
    listarAuditoria,
} = require('../src/db/auditLog');

const {
    guardarEventoSeguro,
    obtenerEventoSeguro,
} = require('../src/db/secureDocumentStore');

const {
    RECURSOS,
    ACCIONES,
    ROLES,
    POLITICA_SEGURA,
    AccesoDenegadoError,
} = require('../src/security/nosqlAccessControl');

const config = require('../src/db/nosqlConfig');

const DIR_ARTIFACTS = path.join(
    __dirname,
    '..',
    'artifacts',
);

const ARCHIVO_RESULTADO = path.join(
    DIR_ARTIFACTS,
    'm09-remediacion.json',
);

const ACTOR_BASE = process.env.M09_ACTOR || 'ruben-m09';

const EVENTO_ANTES = {
    schema_version: 2,
    event_id: 'evt_m09_abuso_antes',
    device_id: 'NODE-CDRL-M09',
    timestamp: 1795000001000,
    metric_name: 'cpu_temperature',
    metric_value: 45.5,
    firmware_version: '4.0.0',
    quality_score: 0.95,
};

const EVENTO_DESPUES = {
    ...EVENTO_ANTES,
    event_id: 'evt_m09_abuso_despues',
    timestamp: 1795000002000,
};

function crearPoliticaInsegura() {
    const politica = structuredClone(POLITICA_SEGURA);

    politica[ROLES.LECTOR][RECURSOS.EVENTOS].push(
        ACCIONES.CREAR,
    );

    return politica;
}

async function limpiarFixtures() {
    await eliminarEvento(EVENTO_ANTES.event_id);
    await eliminarEvento(EVENTO_DESPUES.event_id);
}

async function comprobarDenegacion(operacion) {
    try {
        await operacion();

        return {
            denegado: false,
            tipo_error: null,
        };
    } catch (error) {
        if (!(error instanceof AccesoDenegadoError)) {
            throw error;
        }

        return {
            denegado: true,
            tipo_error: error.name,
        };
    }
}

function contieneSecretos(valor) {
    const nombresProhibidos = [
        'password',
        'contrasena',
        'contraseña',
        'secret',
        'token',
        'credential',
        'connection_string',
    ];

    if (Array.isArray(valor)) {
        return valor.some(contieneSecretos);
    }

    if (valor && typeof valor === 'object') {
        return Object.entries(valor).some(
            ([clave, contenido]) => (
                nombresProhibidos.some(
                    (nombre) => clave.toLowerCase().includes(nombre),
                )
                || contieneSecretos(contenido)
            ),
        );
    }

    return false;
}

async function main() {
    const fechaInicio = new Date().toISOString();

    const contextoLector = {
        actor: `${ACTOR_BASE}-lector`,
        rol: ROLES.LECTOR,
    };

    const contextoEscritor = {
        actor: `${ACTOR_BASE}-escritor`,
        rol: ROLES.ESCRITOR,
    };

    await limpiarFixtures();

    const politicaInsegura = crearPoliticaInsegura();

    const resultadoAntes = await guardarEventoSeguro(
        contextoLector,
        EVENTO_ANTES,
        {
            politica: politicaInsegura,
        },
    );

    const escrituraDespues = await comprobarDenegacion(
        () => guardarEventoSeguro(
            contextoLector,
            EVENTO_DESPUES,
        ),
    );

    const lecturaNoAutorizada = await comprobarDenegacion(
        () => obtenerEventoSeguro(
            contextoEscritor,
            EVENTO_ANTES.event_id,
        ),
    );

    const actores = new Set([
        contextoLector.actor,
        contextoEscritor.actor,
    ]);

    const auditorias = (await listarAuditoria())
        .filter(
            (registro) => (
                actores.has(registro.actor)
                && registro.fecha >= fechaInicio
            ),
        )
        .map((registro) => ({
            audit_id: registro.audit_id,
            actor: registro.actor,
            accion: registro.accion,
            recurso: registro.recurso,
            fecha: registro.fecha,
            documentos_afectados:
                registro.documentos_afectados,
            resultado: registro.resultado,
        }));

    const auditoriaSinSecretos = !contieneSecretos(
        auditorias,
    );

    const exito = (
        resultadoAntes.creado === true
        && escrituraDespues.denegado === true
        && lecturaNoAutorizada.denegado === true
        && auditorias.some(
            (registro) => (
                registro.accion === ACCIONES.CREAR
                && registro.resultado === 'exito'
            ),
        )
        && auditorias.filter(
            (registro) => registro.resultado === 'denegado',
        ).length >= 2
        && auditoriaSinSecretos
    );

    const resultado = {
        assignmentId: 'M09-seguridad-nosql-auditoria',
        fecha_inicio: fechaInicio,
        fecha_fin: new Date().toISOString(),
        tabla_eventos: config.table,
        tabla_auditoria: config.auditTable,
        vulnerabilidad_inicial: {
            descripcion:
                'el rol lector tenía permiso de escritura',
            escritura_indebida_permitida:
                resultadoAntes.creado === true,
        },
        remediacion: {
            descripcion:
                'se retiró put del rol lector y se aplicó mínimo privilegio',
            escritura_no_autorizada_denegada:
                escrituraDespues.denegado,
            lectura_no_autorizada_denegada:
                lecturaNoAutorizada.denegado,
        },
        auditoria: {
            total_eventos: auditorias.length,
            campos_requeridos: [
                'actor',
                'accion',
                'recurso',
                'resultado',
            ],
            contiene_secretos: !auditoriaSinSecretos,
            eventos: auditorias,
        },
        resultado: exito ? 'exito' : 'fallo',
    };

    fs.mkdirSync(DIR_ARTIFACTS, {
        recursive: true,
    });

    fs.writeFileSync(
        ARCHIVO_RESULTADO,
        `${JSON.stringify(resultado, null, 2)}\n`,
    );

    await limpiarFixtures();

    console.log(
        `M09 remediación: ${resultado.resultado}`,
    );

    console.log(
        `M09 auditorías registradas: ${auditorias.length}`,
    );

    if (!exito) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(
        `error en remediación M09: ${error.message}`,
    );

    process.exit(1);
});

-- Migración Aditiva: Versiones de Documentos Legales y Evidencias Inmutables de Aceptación (Fase 1A.2B)
-- Este archivo es aditivo, independiente y no es ejecutado automáticamente por el servidor en tiempo de arranque.

-- 1. Tabla de versiones aprobadas de documentos legales
CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id VARCHAR PRIMARY KEY,
  document VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  version VARCHAR(32) NOT NULL,
  source_file VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  content_sha256 VARCHAR(64) NOT NULL,
  effective_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Tabla de evidencias de aceptación legal (inmutable, con restricción de borrado de usuario)
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  user_email VARCHAR NOT NULL,
  user_name VARCHAR,
  document_id VARCHAR NOT NULL REFERENCES public.legal_document_versions(id),
  document VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  content_sha256 VARCHAR(64) NOT NULL,
  acceptance_type VARCHAR(64) NOT NULL,
  ip_address VARCHAR(128),
  user_agent TEXT NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_document_id ON public.legal_acceptances(document_id);

-- 3. Funciones y disparadores de inmutabilidad (evitan UPDATE o DELETE)
CREATE OR REPLACE FUNCTION protect_legal_document_versions()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Legal document versions are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_legal_document_versions ON public.legal_document_versions;
CREATE TRIGGER trg_protect_legal_document_versions
  BEFORE UPDATE OR DELETE ON public.legal_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION protect_legal_document_versions();

CREATE OR REPLACE FUNCTION protect_legal_acceptances()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Legal acceptances are immutable audit records and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_legal_acceptances ON public.legal_acceptances;
CREATE TRIGGER trg_protect_legal_acceptances
  BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION protect_legal_acceptances();

-- 4. Sembrado idempotente de versiones aprobadas en el catálogo oficial

INSERT INTO public.legal_document_versions (
  id, document, title, version, source_file, content, content_sha256, effective_at, created_at
) VALUES (
  'convenio:1.0',
  'convenio',
  'Convenio de Colaboración',
  '1.0',
  '01_Convenio_Colaboracion_Credito_Negocios.docx',
  $_doc_convenio_$CRÉDITO NEGOCIOS
CONVENIO DE COLABORACIÓN COMERCIAL
Versión 1.0 | Octubre 2026

Entre CR Mexico Educativo, S.A. de C.V., bajo la marca comercial Crédito Negocios, y el Broker o Master Broker identificado en este Convenio.
DATOS DE LAS PARTES
	Crédito Negocios
	CR Mexico Educativo, S.A. de C.V.

	RFC
	CME1101277C9

	Domicilio
	Ahuehuetes Sur 10, C.P. 11700, Ciudad de México

	Representante legal
	Franco Cusi Bourlon



	Colaborador
	Nombre o razón social: _________________________________

	RFC
	_________________________________

	Domicilio
	_________________________________

	Correo electrónico
	_________________________________

	Teléfono
	_________________________________

	Tipo
	☐ Broker    ☐ Master Broker

	Banco / CLABE
	_________________________________



1. OBJETO
El Colaborador podrá identificar, registrar, referir y acompañar clientes interesados en obtener financiamiento a través de Crédito Negocios. Crédito Negocios pondrá a su disposición la Plataforma, la oferta disponible de instituciones financieras y productos, herramientas de seguimiento e información comercial para desarrollar esta actividad.
2. RELACIÓN INDEPENDIENTE
La relación entre las Partes es de colaboración comercial independiente. Este Convenio no crea relación laboral, subordinación, sociedad, asociación, representación legal, franquicia ni exclusividad. El Colaborador administra libremente su actividad, tiempo, personal y recursos. No existe sueldo ni ingreso garantizado; su remuneración dependerá de las operaciones que generen el derecho a una comisión conforme a las condiciones vigentes.
3. PLATAFORMA CRÉDITO NEGOCIOS
La Plataforma será el medio principal para administrar clientes, solicitudes, instituciones financieras, productos, estatus, protección de clientes, comisiones, pagos, condiciones comerciales, reglas, notificaciones y aceptaciones electrónicas. Sus registros y bitácoras serán la referencia principal para determinar fechas, estatus, atribución de clientes y condiciones aplicables a las operaciones.
4. CLIENTES Y REGLAS DE LA RED
Crédito Negocios reconoce y respetará la atribución comercial de los clientes del Colaborador mientras se encuentren protegidos conforme a las Reglas de la Red vigentes en la Plataforma.
• Un registro válido tendrá actualmente hasta 90 días para convertirse en una solicitud de financiamiento.
• Una solicitud válida generará actualmente 120 días de protección a partir de su envío.
• Si al vencer dicho plazo la operación continúa legítimamente en proceso, la protección seguirá hasta su resolución.
• Después de una dispersión, el Broker tendrá actualmente 12 meses de protección para renovaciones y nuevas necesidades de financiamiento; una nueva dispersión reinicia el periodo.
Las Reglas de la Red explicarán también la liberación, reactivación, reasignación y demás supuestos aplicables. El historial de los clientes no se eliminará por el solo vencimiento de una protección.
5. CAMBIO DE BROKER Y PROTECCIÓN CONTRA ELUSIÓN
Un cliente protegido no será reasignado libremente. Podrá existir cambio por solicitud expresa del cliente, abandono, conducta indebida, fraude, baja del Broker, incumplimiento grave u otra causa justificada. Cuando corresponda, Crédito Negocios solicitará evidencia y conservará registro del cambio.
Crédito Negocios no utilizará deliberadamente información de un cliente protegido para excluir al Colaborador de una operación con la finalidad de evitar una comisión que legítimamente le corresponda. De igual forma, el Colaborador no deberá utilizar información, relaciones o condiciones obtenidas a través de Crédito Negocios para eludir deliberadamente la Plataforma en operaciones protegidas. Lo anterior no limita el derecho del cliente a decidir con quién desea trabajar.
6. INSTITUCIONES FINANCIERAS Y PRODUCTOS
Crédito Negocios podrá incorporar, modificar, suspender o retirar instituciones financieras y productos. Cada institución determina independientemente sus criterios de crédito, requisitos, montos, tasas, plazos, garantías, autorizaciones y rechazos. Crédito Negocios no garantiza la aprobación ni la dispersión de ningún financiamiento.
7. CONDICIONES COMERCIALES Y CAMBIOS
Las comisiones aplicables estarán disponibles en la Plataforma y podrán variar por institución financiera, producto y tipo de Colaborador. La Plataforma mostrará la comisión y su forma de cálculo antes de operar bajo dicha condición.
Crédito Negocios podrá actualizar las condiciones comerciales hacia futuro. Cuando exista un cambio económico material, la Plataforma mostrará de forma clara la condición anterior, la nueva condición, el producto o institución afectados y la fecha de entrada en vigor. Cuando corresponda, el Colaborador deberá aceptar electrónicamente el cambio antes de generar nuevas operaciones bajo esa condición.
Como regla general, una modificación posterior no cambiará retroactivamente el derecho económico de una operación que ya haya quedado válidamente vinculada a una condición anterior. La Plataforma conservará la versión aplicable a cada operación.
8. GENERACIÓN Y PAGO DE COMISIONES
Salvo que una condición comercial específica establezca otra cosa, la comisión se generará cuando el financiamiento sea efectivamente dispersado. Una solicitud, autorización o firma que no llegue a dispersarse no generará por sí misma una comisión.
La comisión será pagadera una vez que Crédito Negocios haya recibido efectivamente de la institución financiera el pago correspondiente. El Colaborador deberá cumplir los requisitos fiscales aplicables y mantener actualizados sus datos bancarios.
9. FRAUDE, CANCELACIÓN O REVERSIÓN
Si una institución financiera cancela o exige devolver una comisión por fraude, documentación falsa, cancelación, reversión u otra causa relacionada con la operación, podrá cancelarse también la comisión del Colaborador. Si ya hubiera sido pagada, deberá reintegrarla.
Crédito Negocios podrá compensar la cantidad correspondiente contra futuras comisiones. Si después de 90 días naturales continúa existiendo un saldo pendiente, el Colaborador deberá devolverlo directamente a Crédito Negocios.
10. RESPONSABILIDADES DEL COLABORADOR
• Actuar de buena fe y proporcionar información verdadera.
• No alterar, falsificar ni presentar deliberadamente documentación o información falsa.
• Proteger la información de los clientes y obtenerla por medios legítimos.
• Dar seguimiento razonable a sus operaciones y respetar las reglas vigentes de la Plataforma.
• Informar irregularidades relevantes que conozca.
• Brindar apoyo comercial razonable, cuando se solicite, para contactar clientes que presenten atrasos; este apoyo no lo hace responsable del crédito ni de las obligaciones de pago del cliente.
11. RESPONSABILIDADES DE CRÉDITO NEGOCIOS
• Dar al Colaborador acceso a la Plataforma conforme a su perfil y mantener disponible la información comercial relevante.
• Dar seguimiento razonable a las operaciones conforme a sus procesos.
• Respetar las reglas de protección de clientes y mantener trazabilidad de las operaciones.
• Informar cambios materiales en las condiciones comerciales y pagar las comisiones que correspondan conforme a este Convenio.
12. NO REPRESENTACIÓN Y USO DE MARCA
Sin autorización expresa, el Colaborador no podrá firmar contratos por Crédito Negocios o por una institución financiera, garantizar aprobaciones, modificar tasas o condiciones, ofrecer beneficios no autorizados, recibir pagos destinados a Crédito Negocios o a una institución financiera, ni presentarse como empleado o representante legal de éstos.
El uso de nombres, logotipos y materiales de Crédito Negocios deberá realizarse únicamente conforme a los lineamientos y autorizaciones vigentes. La celebración del Convenio no transfiere derechos sobre marcas, software, contenidos u otros activos de propiedad intelectual.
13. CONFIDENCIALIDAD Y DATOS PERSONALES
Las Partes deberán proteger la información confidencial a la que tengan acceso con motivo de su relación. El Colaborador utilizará la información de clientes únicamente para las finalidades relacionadas con las solicitudes de financiamiento y deberá contar con las autorizaciones necesarias para proporcionarla.
El tratamiento de datos personales estará sujeto al Aviso de Privacidad de Crédito Negocios y a las reglas aplicables dentro de la Plataforma. Las obligaciones de confidencialidad continuarán después de terminar la relación.
14. RESPONSABILIDAD POR INCUMPLIMIENTO
Cada Parte será responsable por los daños directos y comprobables que cause como consecuencia de su propio incumplimiento. Cuando exista fraude, falsificación, apropiación de recursos, uso indebido de información, cobros no autorizados u otra conducta grave atribuible al Colaborador, Crédito Negocios podrá suspender la operación o pagos relacionados mientras se revisa el caso, compensar cantidades determinadas, solicitar el resarcimiento correspondiente y, cuando proceda, terminar la relación. No se establece una multa fija automática por cualquier incumplimiento.
15. MASTER BROKER
Cuando el Colaborador sea identificado como Master Broker, podrá desarrollar y acompañar una red de Brokers. Cada Broker deberá registrarse y ser aprobado individualmente. Los clientes de la red continuarán atribuidos al Broker que los registre y trabaje; no pasarán automáticamente al Master Broker.
El Master Broker también podrá trabajar clientes propios. Cualquier comisión adicional por su red deberá encontrarse expresamente publicada en sus Condiciones Comerciales. Las Reglas Master Broker vigentes en la Plataforma complementarán este Convenio.
16. VIGENCIA Y TERMINACIÓN
El Convenio tendrá vigencia indefinida. Cualquiera de las Partes podrá terminarlo mediante aviso con al menos 15 días naturales de anticipación. Crédito Negocios podrá suspender o terminar inmediatamente la relación ante fraude, falsificación, suplantación, apropiación de recursos, cobros indebidos, uso indebido de información u otros incumplimientos graves o reiterados.
La terminación no elimina las comisiones legítimamente generadas antes de su fecha efectiva. Las operaciones protegidas que ya se encuentren en proceso podrán continuar hasta su resolución, salvo cuando exista fraude o una causa grave directamente relacionada con ellas.
17. COMUNICACIONES, DOCUMENTOS Y ACEPTACIÓN ELECTRÓNICA
Las Partes reconocen como medios válidos de comunicación la Plataforma, el correo electrónico registrado y otros medios electrónicos que permitan conservar evidencia razonable. El presente Convenio, las Reglas de la Red, las Reglas Master Broker cuando correspondan y las actualizaciones que requieran consentimiento podrán aceptarse electrónicamente dentro de la Plataforma.
Crédito Negocios podrá conservar evidencia de la identidad de la cuenta, documento y versión aceptados, fecha y hora y demás elementos técnicos razonablemente disponibles para acreditar la aceptación. El Colaborador podrá consultar posteriormente en su perfil las versiones aplicables a su relación.
Complementan la relación entre las Partes las Reglas de la Red, las Condiciones Comerciales vigentes en la Plataforma, las Reglas Master Broker cuando correspondan, los Términos y Condiciones de la Plataforma y el Aviso de Privacidad.
18. LEGISLACIÓN Y SOLUCIÓN DE CONTROVERSIAS
El Convenio se regirá por las leyes aplicables de los Estados Unidos Mexicanos. Ante cualquier diferencia, las Partes procurarán primero resolverla de buena fe. Si no fuera posible, se someten a los tribunales competentes de la Ciudad de México, renunciando al fuero que pudiera corresponderles por razón de sus domicilios presentes o futuros.
ACEPTACIÓN
Las Partes manifiestan haber leído y entendido el presente Convenio y aceptan sus términos. Podrá celebrarse mediante firma autógrafa o aceptación electrónica realizada a través de la Plataforma de Crédito Negocios.
	Crédito Negocios
	CR Mexico Educativo, S.A. de C.V.
Representante: Franco Cusi Bourlon
Firma / aceptación: _______________________________

	Colaborador
	Nombre / razón social: _______________________________
Representante, cuando corresponda: __________________
Firma / aceptación: _______________________________

	Fecha
	_________________________________



CONVENIO DE COLABORACIÓN COMERCIAL | Versión 1.0 | Octubre 2026$_doc_convenio_$,
  '8da70ad24e725d7d9e1a15dee77b6058f6e2a41ea6fe996ab3d3e1cf6400824a',
  NULL,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.legal_document_versions (
  id, document, title, version, source_file, content, content_sha256, effective_at, created_at
) VALUES (
  'reglas-red:1.0',
  'reglas-red',
  'Reglas de la Red',
  '1.0',
  '02_Reglas_de_la_Red_Credito_Negocios.docx',
  $_doc_reglas_red_$CRÉDITO NEGOCIOS
REGLAS DE LA RED
Versión 1.0 | Octubre 2026

Estas reglas explican de manera sencilla cómo Crédito Negocios protege los clientes de sus Brokers. La Plataforma conservará el historial y será la referencia principal para determinar registros, fechas, solicitudes y vigencias.
1. REGISTRO Y RESERVA DEL CLIENTE
Cuando registres un cliente válido en Crédito Negocios tendrás actualmente 90 días naturales para generar una solicitud de financiamiento. Durante ese periodo el cliente quedará reservado para ti.
Registrar únicamente un nombre, RFC o una base de prospectos sin una oportunidad comercial real no será suficiente para generar protección.
2. SOLICITUD Y PROTECCIÓN
Cuando envíes una solicitud válida de financiamiento, el cliente quedará protegido para ti durante 120 días naturales contados desde la fecha de envío. Una solicitud guardada solamente como borrador no genera esta protección.
3. OPERACIÓN QUE SIGUE EN PROCESO
Si llegan los 120 días y la operación continúa realmente en análisis, autorización, formalización, firma, cumplimiento de condiciones o pendiente de dispersión, el cliente seguirá protegido hasta que exista una resolución. Una operación no podrá mantenerse abierta artificialmente sólo para conservar la protección.
4. LIBERACIÓN Y REACTIVACIÓN
Si pasan los 90 días sin solicitud, o concluye la protección aplicable sin una operación activa, el cliente podrá quedar Liberado. Esto significa que deja de existir exclusividad a favor del Broker; no significa que el cliente se borre o quede bloqueado.
Un cliente liberado no se ofrecerá públicamente a la red. Podrá ser nuevamente trabajado por el Broker original, por otro Broker o directamente por Crédito Negocios. La primera nueva gestión válida determinará la nueva atribución y el historial anterior se conservará.
5. CAMBIO DE BROKER
Un cliente protegido no cambiará de Broker sin causa válida. Podrá existir cambio cuando el cliente lo solicite expresamente, exista abandono, conducta indebida, fraude, baja del Broker u otro incumplimiento grave. Cuando corresponda, Crédito Negocios solicitará evidencia y conservará registro de la reasignación.
6. DISPERSIÓN, RENOVACIONES Y NUEVAS OPERACIONES
Cuando tu cliente reciba un financiamiento, conservarás actualmente la protección comercial durante 12 meses desde la última dispersión. Durante ese periodo podrás continuar atendiendo renovaciones, nuevos créditos, ampliaciones y otras necesidades de financiamiento.
Si se realiza una nueva dispersión, los 12 meses comienzan nuevamente desde esa fecha. Si una nueva solicitud válida se inicia antes de vencer la protección, el cliente continuará protegido mientras esa operación permanezca legítimamente activa.


7. CLIENTE LIBERADO VS. CLIENTE BLOQUEADO
Un cliente Liberado puede realizar nuevas operaciones, pero actualmente no está protegido para un Broker determinado. Un cliente Bloqueado o Inhabilitado no podrá generar nuevas operaciones mientras se mantenga ese estado, por ejemplo ante fraude, documentación falsa, suplantación, restricciones de cumplimiento u otros riesgos relevantes.
8. CRÉDITO NEGOCIOS DIRECTO
Crédito Negocios podrá trabajar directamente clientes que se encuentren válidamente liberados. Cuando esto ocurra, la Plataforma registrará la nueva gestión y aplicará las reglas de atribución correspondientes. Crédito Negocios respetará los clientes y operaciones que permanezcan válidamente protegidos para un Broker.
9. LA PLATAFORMA ES LA REFERENCIA OPERATIVA
En caso de duda o conflicto se revisarán los registros disponibles en la Plataforma, incluyendo fecha de registro, solicitudes, actividad, dispersiones, vigencias, reasignaciones y evidencia disponible. Los Brokers deberán respetar también los clientes protegidos de otros integrantes de la red.
10. CAMBIOS EN ESTAS REGLAS
Las reglas vigentes estarán siempre disponibles en la Plataforma. Los ajustes administrativos o aclaraciones menores podrán actualizarse sin una nueva aceptación. Cuando exista un cambio que afecte materialmente tus derechos, como los periodos de protección, Crédito Negocios mostrará claramente el cambio y solicitará aceptación electrónica cuando corresponda.
Como regla general, una nueva versión no eliminará retroactivamente una protección ya generada de forma válida.
REGLAS DE LA RED | Versión 1.0 | Octubre 2026$_doc_reglas_red_$,
  '0b63f36bbefc7e94cb35be0fd98816c4773f1409b576b83769cebdd5f879014c',
  NULL,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.legal_document_versions (
  id, document, title, version, source_file, content, content_sha256, effective_at, created_at
) VALUES (
  'reglas-master:1.0',
  'reglas-master',
  'Reglas Master Broker',
  '1.0',
  '03_Reglas_Master_Broker_Credito_Negocios.docx',
  $_doc_reglas_master_$CRÉDITO NEGOCIOS
REGLAS MASTER BROKER
Versión 1.0 | Octubre 2026

Estas reglas aplican únicamente a los usuarios identificados como Master Broker dentro de Crédito Negocios y complementan el Convenio de Colaboración y las Reglas de la Red.
1. TU RED DE BROKERS
Como Master Broker podrás desarrollar y acompañar una red de Brokers dentro de Crédito Negocios. Podrás invitarlos, apoyarlos en su incorporación, orientarlos y dar seguimiento general al desempeño de tu red.
Cada Broker deberá registrarse, completar su proceso de alta y ser aprobado individualmente por Crédito Negocios. La Plataforma será la referencia oficial para determinar qué Brokers forman parte de tu red.
2. CLIENTES DE LOS BROKERS DE TU RED
Los clientes de la red estarán atribuidos al Broker que efectivamente los registre y trabaje conforme a las Reglas de la Red. Ser Master Broker no convierte automáticamente en tuyos los clientes de tus Brokers.
Podrás tener visibilidad sobre la actividad de tu red conforme a los permisos de la Plataforma, pero no podrás tomar o reasignar clientes de otro Broker sin una causa válida y autorización de Crédito Negocios.
3. TUS CLIENTES PROPIOS
Además de administrar tu red, podrás registrar y trabajar tus propios clientes. En esas operaciones tendrás los mismos derechos y obligaciones aplicables a cualquier Broker. La Plataforma distinguirá entre clientes propios y operaciones generadas por tu red.
4. COMISIONES DE MASTER BROKER
Ser Master Broker no genera automáticamente una comisión adicional sobre todas las operaciones de tu red. Cuando Crédito Negocios establezca una comisión, incentivo u override para Master Brokers, deberá aparecer claramente en tus Condiciones Comerciales dentro de la Plataforma, indicando producto, financiera, forma de cálculo, vigencia y condiciones aplicables.
Si no existe una comisión de red publicada para una operación, no existirá una comisión adicional de Master Broker.


5. CAMBIOS EN TU RED
Un Broker podrá salir de tu red o cambiar de Master Broker conforme a las reglas de Crédito Negocios. La Plataforma conservará el historial del movimiento.
Un cambio de Master Broker no modificará retroactivamente operaciones que ya hubieran generado derechos económicos bajo una relación anterior. Las nuevas operaciones se regirán conforme a la nueva vinculación.
6. SI TERMINA TU RELACIÓN COMO MASTER BROKER
Si dejas de ser Master Broker, los Brokers de tu red no serán automáticamente dados de baja y sus clientes continuarán atribuidos a cada Broker. Crédito Negocios podrá mantener a dichos Brokers directamente o vincularlos posteriormente con otro Master Broker. Las comisiones legítimamente generadas antes del cambio se respetarán conforme a sus condiciones aplicables.
7. RESPONSABILIDAD E INFORMACIÓN DE TU RED
Cada Broker es responsable de sus propios actos, clientes y operaciones. No serás automáticamente responsable por todo lo que haga un Broker de tu red. Sí podrás tener responsabilidad cuando participes directamente en una conducta indebida, la instruyas, la conozcas y deliberadamente la permitas, o participes de un beneficio indebido derivado de ella.
Como Master Broker deberás informar a Crédito Negocios cuando conozcas una irregularidad relevante dentro de tu red. Crédito Negocios podrá darte acceso a la información necesaria para administrar tu red, como Brokers activos, solicitudes, dispersiones, productividad y comisiones de red cuando existan. Dicha información deberá utilizarse únicamente para administrar la red y estará sujeta a las obligaciones de confidencialidad y protección de información.
8. REGLAS Y CONDICIONES VIGENTES
Las reglas y condiciones aplicables estarán disponibles en la Plataforma. Los cambios materiales que requieran aceptación se mostrarán de forma clara y podrán aceptarse electrónicamente conforme al Convenio de Colaboración.
REGLAS MASTER BROKER | Versión 1.0 | Octubre 2026$_doc_reglas_master_$,
  'd7f3aca19b76f7b551a2a3f6df623bd9f236513a15c8410be4d9eaea4cc56760',
  NULL,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.legal_document_versions (
  id, document, title, version, source_file, content, content_sha256, effective_at, created_at
) VALUES (
  'terminos:1.0',
  'terminos',
  'Términos y Condiciones',
  '1.0',
  '04_Terminos_y_Condiciones_Credito_Negocios.docx',
  $_doc_terminos_$Crédito Negocios | TÉRMINOS Y CONDICIONES V1.0
Crédito Negocios
TÉRMINOS Y CONDICIONES DE USO
V1.0 · Vigente a partir del 6 de octubre de 2026
	Responsable / Proveedor
	CR Mexico Educativo, S.A. de C.V.

	Marca
	Crédito Negocios

	RFC
	CME1101277C9

	Sitio
	https://www.creditonegocios.com.mx

	Domicilio
	Ahuehuetes Sur 10, C.P. 11700, Ciudad de México

	Contacto
	info@creditonegocios.com.mx



Estos Términos y Condiciones (los “Términos”) regulan el acceso y uso del sitio web, plataforma, aplicaciones, portales, formularios y herramientas digitales ofrecidos bajo la marca Crédito Negocios (la “Plataforma”). La Plataforma es operada por CR Mexico Educativo, S.A. de C.V. (“Crédito Negocios”, “nosotros” o “nuestro”). Al crear una cuenta, marcar una casilla de aceptación o utilizar la Plataforma, el usuario acepta estos Términos. Cuando exista un Convenio de Colaboración, una condición comercial específica o un contrato celebrado con una institución financiera, dicho documento regirá la materia específica que corresponda.
1. QUIÉN PUEDE UTILIZAR LA PLATAFORMA
La Plataforma está dirigida principalmente a empresas, personas físicas con actividad empresarial, representantes de negocios, Brokers, Master Brokers y otros participantes autorizados dentro del ecosistema de Crédito Negocios.
Quien utilice la Plataforma deberá contar con capacidad legal suficiente y proporcionar información verdadera, completa y actualizada. Si actúa en nombre de una persona moral, declara contar con autorización suficiente para realizar las acciones correspondientes.
2. NATURALEZA DE CRÉDITO NEGOCIOS
Crédito Negocios facilita la originación, integración, canalización y seguimiento de solicitudes de financiamiento con distintas instituciones y aliados financieros. Salvo que expresamente se indique lo contrario para un producto determinado, Crédito Negocios no es quien otorga el financiamiento ni decide su aprobación final.
Las instituciones financieras determinan de manera independiente sus criterios de crédito, documentación, montos, tasas, plazos, garantías, autorizaciones, rechazos y condiciones. La aprobación, contratación y dispersión dependen de dichas instituciones y de la información del solicitante.
3. CUENTAS Y SEGURIDAD
Las credenciales de acceso son personales. El usuario es responsable de mantenerlas confidenciales y de notificarnos si detecta un acceso no autorizado.
Crédito Negocios podrá utilizar mecanismos razonables de verificación, incluyendo correo verificado, códigos de un solo uso, controles de sesión y validaciones adicionales cuando resulten necesarios para seguridad, cumplimiento o aceptación de documentos.
4. BROKERS Y MASTER BROKERS
Un usuario podrá registrarse y conocer la Plataforma antes de formalizar una relación comercial como Broker o Master Broker. Para registrar o canalizar clientes y generar derechos económicos, Crédito Negocios podrá requerir la aceptación previa del Convenio de Colaboración y de las reglas aplicables.
Las reglas de protección de clientes, atribución, comisiones y Master Brokers se regirán por el Convenio de Colaboración, las Reglas de la Red, las Reglas Master Broker y las Condiciones Comerciales vigentes dentro de la Plataforma.
5. SOLICITUDES DE FINANCIAMIENTO
El usuario deberá proporcionar información y documentación correcta y suficiente para procesar una solicitud. Crédito Negocios podrá solicitar información adicional, corregir datos evidentes con autorización, requerir aclaraciones o cerrar solicitudes incompletas, duplicadas, abandonadas o que presenten riesgos relevantes.
El envío de una solicitud no constituye promesa de aprobación, oferta irrevocable, autorización de crédito ni obligación de dispersión.
6. DOCUMENTACIÓN E INFORMACIÓN DE TERCEROS
Quien cargue o proporcione información de otra persona declara contar con una base legítima, autorización o facultad suficiente para hacerlo y deberá poner a disposición del titular el aviso de privacidad que corresponda.
Cuando la información incluya datos financieros, patrimoniales o documentación de un prospecto, Crédito Negocios podrá requerir evidencia adicional de consentimiento antes de canalizarla a una institución financiera.
7. USO PERMITIDO Y CONDUCTAS PROHIBIDAS
Utilizar la Plataforma únicamente para finalidades lícitas y relacionadas con los servicios ofrecidos.
No presentar documentación falsa, alterada o obtenida de manera ilícita.
No suplantar identidades ni intentar acceder a cuentas o información de terceros sin autorización.
No prometer aprobaciones, tasas o condiciones que no hayan sido formalmente autorizadas.
No utilizar la Plataforma para fraude, lavado de dinero, corrupción, engaño, spam, malware o actividades ilícitas.
No copiar, extraer masivamente, revender o explotar información, software, bases de datos o contenidos de Crédito Negocios fuera de lo autorizado.
No intentar vulnerar controles de seguridad, alterar registros, evadir permisos o interferir con la operación de la Plataforma.
8. INSTITUCIONES, PRODUCTOS Y CONDICIONES
Crédito Negocios podrá incorporar, modificar, suspender o retirar instituciones, productos, requisitos o funcionalidades cuando resulte necesario por razones comerciales, técnicas, regulatorias, de seguridad o disponibilidad de terceros.
Las condiciones visibles en la Plataforma tienen carácter informativo hasta que la institución financiera correspondiente emita una oferta, autorización o contrato formal. En caso de diferencia, prevalecerán los documentos definitivos emitidos o celebrados con la institución financiera.
9. CONDICIONES COMERCIALES Y ACEPTACIONES ELECTRÓNICAS
Cuando a un Broker o Master Broker le apliquen condiciones comerciales específicas, éstas se mostrarán dentro de la Plataforma. Los cambios materiales podrán requerir aceptación electrónica antes de utilizar la condición actualizada.
Crédito Negocios podrá conservar evidencia razonable de cada aceptación, incluyendo usuario, nombre registrado, correo verificado, fecha y hora, dirección IP, identificadores de sesión, versión del documento y demás registros técnicos disponibles. No será necesario intercambiar documentos por correo electrónico cuando la aceptación se realice dentro de la Plataforma.
10. PRIVACIDAD
El tratamiento de datos personales se rige por el Aviso de Privacidad Integral de Crédito Negocios, disponible en https://www.creditonegocios.com.mx. Cuando la ley requiera consentimiento expreso para determinados datos o transferencias, la Plataforma podrá solicitarlo mediante un acto afirmativo separado.
El usuario es responsable de revisar el Aviso de Privacidad antes de proporcionar información personal propia o de terceros.
11. PROPIEDAD INTELECTUAL
La marca Crédito Negocios, la Plataforma, sus interfaces, software, diseños, documentación, metodologías, bases estructuradas, contenidos y demás elementos propios o licenciados se encuentran protegidos por la legislación aplicable.
El acceso a la Plataforma no transfiere propiedad ni concede licencias distintas de las necesarias para utilizarla conforme a estos Términos y, en su caso, al Convenio aplicable.
12. CONFIDENCIALIDAD
Los usuarios deberán proteger la información no pública a la que accedan a través de la Plataforma, incluyendo expedientes, documentos, condiciones comerciales, información de clientes, instituciones financieras y demás información razonablemente confidencial.
Las obligaciones de confidencialidad aplicables podrán complementarse por el Convenio de Colaboración u otros acuerdos específicos.
13. DISPONIBILIDAD Y SEGURIDAD
Crédito Negocios realizará esfuerzos comercialmente razonables para mantener la Plataforma disponible y segura, pero pueden ocurrir mantenimientos, interrupciones, fallas de proveedores, incidentes de conectividad o eventos fuera de su control razonable.
Crédito Negocios podrá suspender temporalmente accesos o funcionalidades cuando resulte necesario para proteger a usuarios, información, instituciones participantes o la integridad de la Plataforma.
14. SUSPENSIÓN Y TERMINACIÓN
Crédito Negocios podrá limitar o suspender una cuenta cuando exista sospecha razonable de fraude, falsificación, acceso no autorizado, incumplimiento de estos Términos, riesgo de seguridad o conducta que pueda causar daño material a terceros o a la Plataforma.
Cuando la naturaleza del caso lo permita, se podrá solicitar al usuario aclarar o corregir la situación antes de una terminación definitiva. La terminación de una cuenta no elimina obligaciones, comisiones, responsabilidades o derechos previamente generados que deban subsistir conforme a los documentos aplicables.
15. RESPONSABILIDAD
Cada usuario es responsable de la exactitud de la información que proporciona y de las decisiones que adopte con base en ofertas, análisis o información recibida.
En la máxima medida permitida por la ley, Crédito Negocios no será responsable por decisiones de crédito de terceros, rechazos, cambios de condiciones de instituciones financieras, información incorrecta proporcionada por usuarios, fallas exclusivas de servicios externos o eventos fuera de su control razonable.
Nada en estos Términos limita derechos o responsabilidades que legalmente no puedan excluirse.
16. CAMBIOS A LOS TÉRMINOS
Crédito Negocios podrá actualizar estos Términos por cambios legales, tecnológicos, de seguridad, producto u operación. La versión vigente estará disponible en la Plataforma o sitio web.
Cuando un cambio sea material para usuarios registrados, se notificará por un medio razonable y, cuando corresponda, se solicitará una nueva aceptación electrónica.
17. COMUNICACIONES ELECTRÓNICAS
El usuario acepta recibir comunicaciones relacionadas con su cuenta, seguridad, solicitudes, operaciones, documentos, cambios de condiciones y servicio por medio de la Plataforma, correo electrónico u otros canales que haya proporcionado o autorizado.
El usuario deberá mantener actualizados sus datos de contacto.
18. LEY APLICABLE Y CONTACTO
Estos Términos se regirán por las leyes aplicables de los Estados Unidos Mexicanos. Las partes procurarán resolver de buena fe cualquier diferencia antes de acudir a una instancia formal.
Para usuarios empresariales y en la medida permitida por la ley, las controversias se someterán a los tribunales competentes de la Ciudad de México. Los derechos irrenunciables que pudieran corresponder a una persona por disposición legal permanecerán vigentes.
Contacto: info@creditonegocios.com.mx | https://www.creditonegocios.com.mx | Ahuehuetes Sur 10, C.P. 11700, Ciudad de México.
ACEPTACIÓN ELECTRÓNICA
Al marcar la casilla de aceptación correspondiente o continuar mediante el mecanismo habilitado por la Plataforma, el usuario manifiesta haber tenido acceso a estos Términos y aceptarlos en su versión vigente.
CR Mexico Educativo, S.A. de C.V. | Crédito Negocios$_doc_terminos_$,
  'e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb',
  '2026-10-06T00:00:00-06:00'::timestamp,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.legal_document_versions (
  id, document, title, version, source_file, content, content_sha256, effective_at, created_at
) VALUES (
  'aviso:1.0',
  'aviso',
  'Aviso de Privacidad Integral',
  '1.0',
  '05_Aviso_de_Privacidad_Integral_Credito_Negocios.docx',
  $_doc_aviso_$Crédito Negocios | AVISO DE PRIVACIDAD V1.0
Crédito Negocios
AVISO DE PRIVACIDAD INTEGRAL
V1.0 · Vigente a partir del 6 de octubre de 2026
	Responsable / Proveedor
	CR Mexico Educativo, S.A. de C.V.

	Marca
	Crédito Negocios

	RFC
	CME1101277C9

	Sitio
	https://www.creditonegocios.com.mx

	Domicilio
	Ahuehuetes Sur 10, C.P. 11700, Ciudad de México

	Contacto
	info@creditonegocios.com.mx



CR Mexico Educativo, S.A. de C.V., que opera comercialmente bajo la marca Crédito Negocios (“Crédito Negocios” o el “Responsable”), pone a disposición el presente Aviso de Privacidad Integral para informar cómo recaba, utiliza, almacena, protege y, en su caso, transfiere datos personales relacionados con su sitio web, Plataforma, red de Brokers y Master Brokers, prospectos, solicitantes de financiamiento, representantes, contactos y demás personas que interactúan con Crédito Negocios.
1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE
Responsable: CR Mexico Educativo, S.A. de C.V..
RFC: CME1101277C9.
Domicilio: Ahuehuetes Sur 10, C.P. 11700, Ciudad de México.
Sitio web: https://www.creditonegocios.com.mx.
Correo para privacidad y derechos ARCO: info@creditonegocios.com.mx.
2. DATOS PERSONALES QUE PODEMOS TRATAR
Datos de identificación y contacto: nombre, apellidos, correo electrónico, teléfono, firma, cargo, empresa y datos de representantes.
Datos de cuenta y autenticación: usuario, credenciales cifradas, roles, permisos, registros de acceso, fecha y hora, dirección IP, identificadores de sesión y mecanismos de verificación.
Datos empresariales y corporativos: razón social, actividad, antigüedad, estructura, accionistas o beneficiarios cuando resulte necesario, representantes, domicilio y documentación corporativa.
Datos fiscales: RFC, constancia de situación fiscal, declaraciones, comprobantes, facturación y demás información fiscal necesaria para solicitudes u obligaciones administrativas.
Datos financieros y patrimoniales: ingresos, ventas, estados de cuenta, saldos, movimientos, estados financieros, deudas, activos, pasivos, facturas, cuentas por cobrar, información bancaria, CLABE, garantías y demás información necesaria para evaluar o estructurar financiamiento.
Datos relacionados con historial y capacidad crediticia cuando sean proporcionados por el titular, por una institución participante o mediante mecanismos legalmente autorizados.
Documentación de soporte: identificaciones, comprobantes, contratos, solicitudes, poderes, escrituras, evidencias y archivos asociados a una operación.
Datos de comunicaciones y soporte: correos, mensajes, chats, comentarios, archivos adjuntos y comunicaciones relacionadas con solicitudes u operaciones.
Datos técnicos y de uso: navegador, dispositivo, sistema operativo, cookies, logs, páginas visitadas, eventos de seguridad y geolocalización aproximada derivada de la red cuando resulte necesaria para seguridad o analítica.
Datos sensibles. Crédito Negocios no solicita de forma general datos personales sensibles. Si un caso particular requiriera tratarlos, se informará la finalidad y se obtendrá el consentimiento correspondiente antes de su tratamiento.
3. DE DÓNDE OBTENEMOS LOS DATOS
Podemos obtener datos directamente de la persona titular; de la empresa u organización que representa; de Brokers o Master Brokers que cuenten con autorización para referirla; de instituciones financieras y aliados que participen en una operación; de integraciones autorizadas; de proveedores que apoyan la prestación del servicio; y de fuentes públicas o profesionales lícitas cuando resulte necesario.
4. FINALIDADES PRIMARIAS
crear, verificar, administrar y proteger cuentas de usuario;
incorporar y administrar Brokers, Master Brokers y sus redes;
recibir, integrar, validar y dar seguimiento a solicitudes de financiamiento;
analizar información para identificar productos o instituciones potencialmente compatibles con una solicitud;
canalizar información y expedientes a instituciones financieras o aliados participantes para cotización, análisis, autorización, formalización y, en su caso, dispersión;
solicitar información adicional, aclaraciones o documentos necesarios para procesar una operación;
comunicar estatus, ofertas, requisitos, rechazos, autorizaciones y demás información relacionada con una solicitud;
administrar protección y atribución de clientes, comisiones y pagos a Brokers o Master Brokers;
prevenir fraude, suplantación, abuso, accesos no autorizados y otros riesgos;
cumplir obligaciones legales, fiscales, contractuales, de auditoría, conservación y defensa de derechos;
atender soporte, aclaraciones, disputas y solicitudes de privacidad;
mantener, asegurar y mejorar la operación de la Plataforma mediante métricas y analítica, procurando utilizar información agregada o desidentificada cuando sea suficiente.
5. FINALIDADES SECUNDARIAS
Cuando la legislación aplicable lo permita, podremos utilizar datos de contacto para enviar información sobre nuevos productos, instituciones participantes, eventos, contenidos, encuestas, promociones o servicios relacionados con Crédito Negocios.
La persona titular puede solicitar dejar de recibir comunicaciones promocionales mediante los mecanismos incluidos en cada mensaje o escribiendo a info@creditonegocios.com.mx. La negativa a estas finalidades no afectará el procesamiento de una solicitud ya iniciada.
6. CONSENTIMIENTO PARA DATOS FINANCIEROS Y PATRIMONIALES
Cuando Crédito Negocios recabe o trate datos financieros o patrimoniales y la legislación requiera consentimiento expreso, éste se solicitará mediante una acción afirmativa separada dentro del formulario o Plataforma, por medios electrónicos u otro mecanismo que permita conservar evidencia de la manifestación de voluntad.
La aceptación general de este Aviso no sustituirá una manifestación expresa cuando ésta sea legalmente necesaria.
7. BROKERS Y DATOS DE SUS CLIENTES
Cuando un Broker o Master Broker proporcione información de un prospecto o cliente, deberá contar con autorización suficiente para compartirla y para iniciar la gestión correspondiente. Crédito Negocios podrá solicitar evidencia de dicha autorización o contactar directamente al titular para confirmar su consentimiento.
El hecho de que un Broker haya obtenido datos de una persona no elimina la obligación de Crédito Negocios de informar al titular sobre el tratamiento que realizará cuando legalmente corresponda.
8. TRANSFERENCIAS A INSTITUCIONES FINANCIERAS Y OTROS TERCEROS
Para buscar, comparar, estructurar, evaluar, formalizar o dar seguimiento a una solicitud de financiamiento, Crédito Negocios podrá transferir datos personales y documentación a instituciones financieras, bancos, SOFOMES, arrendadoras, empresas de factoraje, fondos, entidades de financiamiento, aseguradoras, proveedores de garantías y otros aliados que puedan participar en la operación solicitada.
Cada tercero receptor podrá actuar como responsable independiente respecto del tratamiento que realice y deberá sujetarse a su propio marco legal y aviso de privacidad.
Cuando una transferencia requiera consentimiento de la persona titular, Crédito Negocios lo solicitará expresamente antes de efectuarla. La negativa podrá impedir que la solicitud sea canalizada a determinadas instituciones, sin afectar tratamientos que puedan realizarse por otra base legal.
Texto sugerido de consentimiento en Plataforma: “Autorizo expresamente a CR Mexico Educativo, S.A. de C.V. para tratar mis datos financieros y patrimoniales y, cuando sea necesario para gestionar mi solicitud, transferirlos junto con mi expediente a las instituciones financieras y aliados participantes que puedan evaluar, cotizar, formalizar o administrar el financiamiento solicitado.”
9. ENCARGADOS Y PROVEEDORES
Crédito Negocios podrá utilizar proveedores que actúen por cuenta del Responsable para servicios como infraestructura tecnológica, alojamiento, seguridad, comunicaciones, firma o aceptación electrónica, almacenamiento, soporte, analítica, validación de información y otras funciones necesarias para operar la Plataforma.
Estos proveedores deberán tratar los datos conforme a las instrucciones y obligaciones aplicables a la prestación de sus servicios.
10. COOKIES Y DATOS TÉCNICOS
El sitio y la Plataforma pueden utilizar cookies, almacenamiento local y tecnologías similares para mantener sesiones, recordar preferencias, reforzar seguridad, medir rendimiento y analizar el uso.
Cuando la legislación aplicable requiera consentimiento previo para tecnologías no esenciales, se habilitarán los mecanismos correspondientes. El usuario también puede administrar ciertas tecnologías desde su navegador.
11. SEGURIDAD Y CONSERVACIÓN
Crédito Negocios implementará medidas técnicas, administrativas y organizativas razonables para proteger los datos personales contra pérdida, alteración, destrucción, acceso, uso o tratamiento no autorizado.
Los datos se conservarán durante el tiempo necesario para cumplir las finalidades señaladas, mantener y documentar relaciones y operaciones, atender controversias y cumplir obligaciones legales, fiscales, regulatorias y de conservación. Posteriormente podrán bloquearse, eliminarse o anonimizarse conforme a la normativa y ciclos técnicos aplicables.
12. DERECHOS ARCO, REVOCACIÓN Y LIMITACIÓN
Las personas titulares podrán ejercer los derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO), así como solicitar la revocación del consentimiento o la limitación del uso o divulgación de sus datos cuando proceda, enviando su solicitud a info@creditonegocios.com.mx.
La solicitud deberá incluir nombre y medio para recibir respuesta; elementos razonables para acreditar identidad y, en su caso, representación; descripción clara de los datos involucrados; derecho o solicitud que desea ejercer; y cualquier información que ayude a localizar los datos.
Crédito Negocios atenderá las solicitudes dentro de los plazos establecidos por la legislación aplicable y podrá solicitar información adicional estrictamente necesaria para verificar identidad y proteger los datos contra solicitudes fraudulentas.
13. MENORES DE EDAD
Los servicios de Crédito Negocios no están dirigidos a menores de edad. Si llegáramos a identificar que se proporcionaron datos de una persona menor sin la autorización legal correspondiente, adoptaremos medidas razonables para eliminarlos o regularizar su tratamiento.
14. CAMBIOS AL AVISO Y CONTACTO
Crédito Negocios podrá actualizar este Aviso por cambios legales, tecnológicos, de producto, instituciones participantes o prácticas de tratamiento. La versión vigente estará disponible en https://www.creditonegocios.com.mx y/o dentro de la Plataforma. Cuando un cambio sea material y la ley lo requiera, se notificará adicionalmente por un medio razonable.
Para dudas relacionadas con privacidad o tratamiento de datos personales puede escribir a info@creditonegocios.com.mx. Domicilio: Ahuehuetes Sur 10, C.P. 11700, Ciudad de México.
CR Mexico Educativo, S.A. de C.V. | Crédito Negocios$_doc_aviso_$,
  '66b082fab14d3aded2362796ded41f88b6ee71e2452208f024c48e16f1416efd',
  '2026-10-06T00:00:00-06:00'::timestamp,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

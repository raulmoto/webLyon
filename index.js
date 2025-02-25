//Importaciones -------------------------------------------
import express from 'express';
import sequelize from './src/db/lyonDB.js';
import rutas from './src/routes/rutas.js';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import bodyParser from 'body-parser';
import {jwtRegister,jwtLogin } from './src/security/securitytoken.js';
import verifyToken from './src/security/auth.js';
import logout from './src/security/logout.js';
import {guardarReserva} from './src/controllers/datos_reserva.js';
import fs from 'fs';
import dotenv from 'dotenv'; //para cargar variables de entrono desde un archivo .env
import {defineRelations } from './src/relations/relaciones.js';//relaciones
import cache from './src/middleware/cache.js';
import session from 'express-session';
import sessionConfig from './src/security/sesion_Config.js';
import {token_cliente} from './src/security/tokenAccess.js';
import UsuarioModel from './src/models/usuario.js';
import decodificarToken from './src/security/decodificarTokenYrevisar.js';
import {boton_estado,actualizar_boton_estado} from './src/security/botonEstado.js';

//Modelos--------------------------------
import ClienteModel from './src/models/cliente.js';
import EstadoBoton_Model from './src//models/estadoBoton.js';
import SesionModel from './src/models/sesion.js';
import MensajeModel from './src/models/mensajes.js';
import ReservaModel from './src/models/reserva.js';

// Define las relaciones llamando a la función defineRelations
defineRelations();
var template = fs.readFileSync('./views/pages/gmail.ejs', 'utf-8');
let fechasDisponibles = {};
//preparamos la variable de entorno
dotenv.config();
console.log("configuracion----------")
console.log(dotenv.config())
console.log("configuracion----------")
let token_devuelto = '';
var secretKey = process.env.SECRET_KEY;
//console.log(secretKey); // Imprimirá "abc123"
const app = express();
const port = 3000;

app.use(session(sessionConfig));
// Configura cookie-parser
import cookieParser from 'cookie-parser';
app.use(cookieParser());
/*.
  .
  .
  .
*/
//--------------------------------CONFIGURACIONES------------------------------
//configuracion del motor plantillas
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use('/public', express.static(__dirname + '/public'));//para que los archivos en public estén accesibles desde el cliente
app.use(express.json());//para leer los datos JSON
app.set('view engine','ejs')
app.set('views', path.join(__dirname, 'views'));
//configuracion de la sincronizacion con la base de datos=====================
sequelize.sync()
  .then(() => {
    console.log('Sincronización de modelos exitosa');
  })
  .catch((error) => {
    console.error('Error al sincronizar los modelos:', error);
});
// Configurar body-parser para poder obtener los datos del lado del cliente=====================
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
//--------------------------------FIN CONFIGURACIONES------------------------------
/*.
  .
  .
  .
*/
//PÁGINA INICIO-------------------------------
let estados = []
let estadosArray = []
let identificadorUsuario = null; //para guradar el id del usuario cuando se logea y poder usarlo en otros métodos
app.get("/",cache.withTtl('1 hour'),async (req, res) => {
  res.render('pages/inicio');
});

//PAGINA REGISTRO==============================
app.get('/register', async (req, res) => {
  res.render('pages/register',{error_sms:null});
});

//INSERTAR en la DB==============================
app.post('/insertar', async (req, res) => {
  jwtRegister(req,res)
 
});

//pagina login
app.get("/login", async (req, res) => {
  res.render('pages/login',{error_sms:null});
});

//lLOGIN VERIFICION==============================para cuando el usuario se logea

app.post("/verificar_login",cache, async (req, res) => {
  //cogemos el token devuelto despues de inicio de sesionS
  //en el metodo verificamos si es un admin o no, según sea le redirigimos al panel de administrador o a inicio
  try {
  
    let resultado_tras_login = await jwtLogin(req,res,secretKey)
    if (!resultado_tras_login) {
      console.log("El usuario no existe todavía en la base de datos");
      return res.render('pages/login', { error_sms: "USUARIO NO EXISTE!!, PRUEBE REGISTRARSE" });
    }
    const { admin, id, refreshToken, token,error,error_sms } = resultado_tras_login;
    identificadorUsuario = id;
    if (error){
      return res.render('pages/login', { error_sms: "USUARIO NO COINCIDE!!," });
    }else if(error_sms){
      return res.render('pages/login', { error_sms: "Rellene todos los campos!!" });
    }
    else if (!admin) {
      // Usuario no es admin
      res.cookie('refres_token', refreshToken, { maxAge: 3600000 });
      res.cookie('access_token', token, { maxAge: 3600000 });
      res.render('pages/inicio', { user: { isAdmin: false } });
    } else {
      // Usuario es admin
      res.cookie('refres_token', JSON.stringify({ refresh_t: refreshToken }), { maxAge: 3600000 });
      res.cookie('access_token', JSON.stringify({ token: token }), { maxAge: 3600000 });
      res.render('pages/admin');
    }
  } catch (error) {
    console.log(error)
  }
});

app.post("/verificarToken", async (req, res) => {
  let datos = req.body.token
  console.log("antes de verificar:"+datos)
  let resultado = await verifyToken(res,datos)
  console.log("resultado=======true o false ===>"+resultado)
  if(resultado){
    console.log("devolvemos true")
    res.json("ok");
  }else{
    identificadorUsuario = null
    console.log("devolvemos false")
    res.status(401).json("not ok");
  }
});

app.post("/generarNuevoToken", async (req, res) => {
  console.log("--------------------------------------------GENERAMOS NUEVO TOKEN")
  let datos = req.body.token
  
  let extrear_datos = await decodificarToken(datos,secretKey)
  console.log("id =="+JSON.stringify(extrear_datos, null, 2));
  let nuevoAccesToken = await token_cliente(extrear_datos.id,extrear_datos.email,secretKey)
  try {
    await sequelize.transaction(async (t) => {
      const result = await UsuarioModel.update({ acces_token: nuevoAccesToken}, {
        where: {
          id: extrear_datos.user_id
        },transaction:t
      });
      if(result[0] > 0){
        res.json("ok");
        //res.cookie('access_token', nuevoAccesToken, { maxAge: 3600000 });
        console.log("datos actualizados correctamente")
      }else{
        console.log("enviamos not ok")
        res.status(401).json("not ok");
      }
    })
    console.log('Transacción completada.'); 
  } catch (error) {
    console.error("Error en la transacción:", error);
  }
  
  
});

//Cerrar sesion ========================
app.post("/logOut",cache, async (req, res) => {
  try {
    const tokenHeader = req.headers.authorization;
    const token = tokenHeader.split(' ')[1];
    console.log("cerramos sesion.............."+token);
    let resultado = await logout(token)
    const {estado,token_access} = resultado;
    if (estado){
      identificadorUsuario = null;
      res.json("ok");
      //res.cookie('access_token', token_access, { maxAge: 3600000 });
    }else{
      res.status(401).json("not ok");
    }
  } catch (error) {
    console.log(error);
    res.redirect('/'); // Manejo de error, redirige al usuario a la página de inicio
  }
});

//este controlador es para que el fetch del inicio pueda venir y buscar el token
app.get('/obtenertoken', async (req, res) => {
  //devolvemos el token al fetch de inicio
  //console.log("buscamos token="+ token_devuelto)
  let token = token_devuelto
  //console.log("este es el token que mandamos::"+token)
  res.json(token);
});

//rellenar formulario reserva==============================
/*
  En este edpoint vamos a aplicar la verificacion de si su token se ha caducado. en caso firmativo verificaremos si su acces token
  sigue activo para luego generarle un nuevo token
*/
let token = '';
let fecha_valor = '';
let identificador_boton = ''
app.post('/datos_reserva', async (req, res) => {
  try {
    console.log("damos clic al boton de reservar--------------")
    fecha_valor = req.body.fecha;
    identificador_boton = req.body.oculto
    let reservado = false
    let ocupado = true
    await boton_estado(identificador_boton)
    console.log("identificador del boton es ="+identificador_boton)
    console.log("TODO SALIÓ BIEN!!:")
    res.render("pages/rellenardatos", { usuario: identificadorUsuario,fecha:fecha_valor,boton:identificador_boton})
  } catch (error) {
    console.log(error)
  }
});

/*
  Este edpoind es llamado desde la vista relena datos. Se encarga de actualizar el estado de los botones que fueron clicados
  cuando el usuairo ha pasado un cierto tiempo sin hacer clic.
*/
app.post('/revertirEstadoBoton', async (req, res) => {
  try {
    console.log("revertirEstadoBoton--------------")
    identificador_boton = req.body.boton
    await actualizar_boton_estado(identificador_boton)
    console.log("identificador del boton es ="+identificador_boton)
    console.log("TODO SALIÓ BIEN!!:")
    res.status(200).json("ok")
    
  } catch (error) {
    console.log(error)
  }
});

/* 
  este edpoind se llama desde reservas, cuando el usairo le da clic al boton reservar, antes de mirar si su token sigue activo, lo primeroque se hace es 
  verificar el estado del boton.
*/
app.post('/comprobarEstadoDelBoton', async (req, res) => {
  try {
    console.log("comprobarEstadoDelBoton--------------")
    identificador_boton = req.body.boton
    console.log("comprobarEstadoDelBoton--------------="+identificador_boton)
    const buscar = await EstadoBoton_Model.findOne({
      where: {
        id: identificador_boton
      },
      attributes: ['id','ocupado','reservado']
    });
    if (buscar && (buscar.ocupado || buscar.reservado)) {
      console.log("okokokokokokokokokokokokokokokokokokokokokokokokokokok--------------")
      res.status(200).json("ok")
      // Ahora puedes usar las propiedades de 'estados'
    } else {
      console.log("NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN--------------")
      // Manejar el caso en el que no se encontró un objeto
      res.status(401).json("not ok")
    }
    
  } catch (error) {
    console.log(error)
  }
});
//ADMINISTRADOR=============================
/*
  Este es el Endpoint que redirige a la vista del administrador, antes de llevarle a la pagina de admin,
  al igual que en otras rutas verificamos la vida del token, en coso que siga siendo válida, le mandamos
  a admin. con el fin que el usuario no pueda navegar a la pagina de admin simplemente poniendo en la URL
  http://localhost:3000/admin
*/
async function  controlDeAcceso(){
  console.log("control de acceso para ver:---------------------"+identificadorUsuario)
  const buscar_usuario = await UsuarioModel.findOne({
    where: {
      id: identificadorUsuario
    },
    attributes: ['contrasenia', 'id','nombre','email','isAdmin']
  });
  console.log("acceso:::"+JSON.stringify(buscar_usuario,null,2))
  if (buscar_usuario==null) {
    return false
  }else{
    return {admin:buscar_usuario.isAdmin}
  }
}
app.get("/admin", async (req, res) => {
  console.log("entramso en admin")
  try {
    // Lógica para manejar la ruta '/reservar' y renderizar 'reservar.ejs'
    console.log("entramos")
    let hayAcceso = await controlDeAcceso()
    console.log("acceso:::"+JSON.stringify(hayAcceso,null,2))
    if (!hayAcceso || !hayAcceso.admin){
      res.render('pages/403');
    }else if (hayAcceso.admin){
      console.log("tienes acceso desde el serividor")
      res.render('pages/admin');
    }
  } catch (error) {
    console.log(error)
  }
});
//PAGINA RESERVA-SECION CALENDARIO ========================(Middelware)
app.get('/reservar',cache,async (req, res) => {
  // Lógica para manejar la ruta '/reservar' y renderizar 'reservar.ejs'
  console.log("entramos")
  let hayAcceso = await controlDeAcceso(req)
  console.log("acceso:::"+JSON.stringify(hayAcceso,null,2))
  if (!hayAcceso || hayAcceso.admin){
    res.render('pages/403');
  }else if (!hayAcceso.admin){
    console.log("tienes acceso desde el serividor")
    res.render('pages/reservar');
  }
});

// esta funcion sirve para eliminar los estados de los botones
async function limpiarEstados(){
  await EstadoBoton_Model.destroy({
    where: {},
  });
} 

/*
  Cada vez que desde el adminsitrador se publiquen nuevas fechas, estas llegan a este edpoint y son 
  almacenadas en el array fechasDisponibles, este array se declara fuera para poder acceder a esos datos 
  desde el edpoind que realiza las peticiones SSE.
*/
app.post('/actualizaciones',async (req, res) => {
  try {
    console.log(JSON.stringify(req.body, null, 2));
    const numero_de_plazas = req.body.data_fecha.num_plazas;
    const fecha1 = req.body.data_fecha.dato_fecha1;
    const fecha2 = req.body.data_fecha.dato_fecha2;
    const fecha3 = req.body.data_fecha.dato_fecha3;
    console.log("el resultado despues de actualizaciones "+estadosArray);
    limpiarEstados()
    console.log(`los esatdos ==>>>>${estadosArray}`);
    fechasDisponibles = {
      plazas: numero_de_plazas,
      fecha1: fecha1,
      fecha2: fecha2,
      fecha3: fecha3,
      estados:null
    };

    res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/*
  Este edpoint, es utilizado por la conexion SSE desde el cliente "reservar.ejs".
  Cuando se carga la plantilla reservar y se construye el html, cada vez que desde el servdior
  se envien nuevas actualizaciones, se hará una peticion a este edpoint para obtener los nuevos datos.

  ese JS se encuentra en la misma plantilla de reservas.
*/

app.get('/obtenerfecha',async (req, res) => {
  try {
    //antes de pasar a calendario, obtenemos todos los id de estados de los botones
    let estados1 = await EstadoBoton_Model.findAll({
      attributes: ['id','ocupado','reservado']
    })
    const estados = {};
    estados1.forEach(estado => {
      estados[estado.id] = {
        ocupado: estado.ocupado,
        reservado: estado.reservado
      };
    });
    fechasDisponibles.estados = estados;
    // Convertir la lista de objetos a un array de valores
    const data = JSON.stringify(fechasDisponibles);
    console.log(`verificamos bien==${data}`)
    console.log(JSON.stringify(`verificamos bien==${data}`, null, 2));

    // Establecer las cabeceras adecuadas para la conexión SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Enviar los datos como un flujo de eventos en formato de texto
    res.write(`data: ${data}\n\n`);
  } catch (error) {
    console.log(error);
    res.json({ success: false });
  }
});

//GUARDAMOS LA RESERVA DE FECHA=========================
/*
  Despues de rellenar los datos de la reserva, almacenamos el estado del boton clicado.
  El identificador del boton primero llega en el edpoint de datos_reserva, lo almaceno en una varible
  para posteriormente poder utilizarlo en este edpoint.
  Despues de alamacer el esatdo del boton, accedo al metodo reservar donde se almacenaran los datos de 
  la reserva y se enviarán los datos por correo electrónico.
*/
app.post('/guardar_reserva', async (req, res) => {
  //guardamos el estado del color del botóns
  try {
    console.log("entramso en guardarReserva")
    const usuario = req.body.id
    console.log(usuario);
    console.log(req.body);
    console.log(`el identificador del boton es ${identificador_boton}`)
    await sequelize.transaction(async (t) => {
      await EstadoBoton_Model.update({ ocupado: true ,reservado: true }, {
        where: {
          id: identificador_boton,
        }, transaction: t 
      });
    })
    console.log('Transacción completada.'); 
    await guardarReserva(req,res,template)
  } catch (error) {
    console.log(error)
  }
});

/*datos para el feth de sesion*/
app.get('/clientes',async(req,res) =>{
  try {
    const todosLosCLientes = await ClienteModel.findAll()
    if (todosLosCLientes){
      res.json(todosLosCLientes)
    }else{
      console.log("no se obtuvo clientes")
    }
  } catch (error) {
    console.log(error)
  }
})

/*datos para el feth de sesion.
  este edpoint realiza una consulta a la base de datos y obtiene unicamente
  los ids de los clientes y los devuelve por json
*/
app.get('/identificadores',async(req,res) =>{
  try {
    const todosLosCLientes = await ClienteModel.findAll({
      attributes: ['aka']
    })
    if (todosLosCLientes !=null){
      console.log(JSON.stringify("clientes:::"+todosLosCLientes, null, 2));
      res.json(todosLosCLientes)
    }else{
      console.log("no se obtuvo id_clientes")
      console.log(JSON.stringify("clientes:::"+todosLosCLientes, null, 2));
    }
  } catch (error) {
    console.log(error)
  }
})
/*Guardar la sesión.
  guarda la sesion en la base de datos
*/
var sesion_guardada = false
app.post('/guardarSesion',async(req,res) =>{
  try {
    console.log("GUARDAMOS LA SESION")
    const aka = req.body.select
    const duracion = req.body.duracion
    const fecha = req.body.fecha
    console.log(`${aka}--${duracion}--${fecha}`)
    /*
      antes queria poder relacionar cliente con sesion usando la unique key de cliente que es aka para unir con id de session,
      pero no son del mismo tipo, así que para guardar la session voy a obtener primero el id del usuario
    */
      const todosLosCLientes = await ClienteModel.findOne({
        where: {
          aka: aka
        },
        attributes: ['id_usuario']
      })
    const save = await SesionModel.create({
      id_cliente: todosLosCLientes.id,
      duracion: duracion,
      fecha: fecha
    },{fields:['id_cliente','duracion','fecha']});
    if(save){
      console.log("cambiamos a true")
      sesion_guardada = true
      console.log("cambiamos a true")
      res.render('pages/admin');
    }  
  } catch (error) {
    console.log(`--->${error}`)
  }
})

/*En este Edpoint obtendremos las reservas realizadas a traves de una vista en la DB*/
app.get('/obtenerreservas', async (req, res) => {
  try {
    //esta query de sequalize devuelve 2 datos, los registros de la consulta y los metadatos
    const [reservas, metadata] = await sequelize.query("SELECT * FROM reservas");
    if (reservas && reservas.length > 0){
      console.log(reservas.length)
      console.log(reservas[0])
      res.json(reservas);
    }else{
      console.log("[Mensaje]: No hay reservas")
      res.json(0);
    }
  } catch (error) { 
  }
});
/*
  Este controlador es para cuando el usuario le manda un mensaje al productor
*/
app.post('/sms_para_productor', async (req, res) => {
  try {
    console.log("mensajes del cliente")
    console.log(JSON.stringify(req.body,null,2))
    const name = req.body.name
    const email = req.body.email
    const subject = req.body.subject
    const mensaje = req.body.message
    console.log("mensajes : "+req.body.message)
    const guardarSms = await MensajeModel.create({
      nombre:name,
      email:email,
      mensaje:mensaje,
      contexto:subject
    },{fields:['nombre','email','mensaje','contexto']})
    res.redirect('/')
    //datos a enviar y gmail
  } catch (error) { 
    console.log(error)
  }
});

/*
  Este controlador es para enviar lso mensaje al administrador atraves de SSE
*/
app.get('/obtenerSms', async (req, res) => {
  try {
    
    const getSms = await MensajeModel.findAll({
      attributes: ['nombre','contexto','email','mensaje']
    })
    if(getSms){
      // Establecer las cabeceras adecuadas para la conexión SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Enviar los datos como un flujo de eventos en formato de texto
      const data = JSON.stringify(getSms);
      res.write(`data: ${data}\n\n`);
      }
      //datos a enviar y gmail
  } catch (error) { 
    console.log(error)
  }
});

/*
  Este controlador es para enviar los mensaje al administrador atraves de fecth
*/
app.get('/obtenerSmsParaFetch', async (req, res) => {
  try {
    
    const getSms = await MensajeModel.findAll({
      attributes: ['nombre','contexto','email','mensaje']
    })
    if(getSms){
      res.json(getSms)
    }
    //datos a enviar y gmail
  } catch (error) { 
    console.log(error)
  }
});
/*
  Cuando el administrador le da clic al icono de la papelera, la ación llega a este controlador y ejecuta la accíon de borrar
  todos los mensajes en la tabla mesnajes de la base de datoss
*/
app.post('/borar_sms', async (req, res) => {
  try {
   console.log("--------borrar-----------")
    await MensajeModel.destroy({
      where:{},
    })
    res.render('pages/admin',{user:req.session.user});
  } catch (error) { 
    console.log(error)
  }
});

/*
  Cuando el administrador le da clic al icono de la papelera, la ación llega a este controlador y ejecuta la accíon de borrar
  todas las reservas
*/
app.post('/borar_reservas', async (req, res) => {
  try {
   console.log("--------borrar reservas-----------")
    await ReservaModel.destroy({
      where:{},
    })
    res.render('pages/admin',{user:req.session.user});
  } catch (error) { 
    console.log(error)
  }
});

/*
  Cuando el administrador le da clic al icono de la papelera, la ación llega a este controlador y ejecuta la accíon de borrar
  todos los clientes
*/
app.post('/borar_clientes', async (req, res) => {
  try {
   console.log("--------borrar Clientes-----------")
   //borramos antes las sesiones vinculadas con esos clientes
    let borrar = await SesionModel.destroy({
      where:{},
    })
    let borrados = await ClienteModel.destroy({
      where:{},
    })
    await sequelize.query(`DELETE FROM usuario WHERE id NOT IN (SELECT id_usuario FROM cliente) and id NOT IN (SELECT id_usuario FROM productor) `);
    console.log("borrados="+JSON.stringify(borrados,null,2))
    res.render('pages/admin');
  } catch (error) { 
    console.log(error)
  }
});

app.use((req, res, next) => {
  res.render('pages/404');
});
//sevidor escuchando
app.listen(port,'0.0.0.0', () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
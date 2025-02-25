drop database if exists lyon;
create database lyon default character set=latin1;
use lyon;
create table usuario (	
    id int primary key auto_increment not null,
    nombre varchar(40),
    gmail varchar(200),
    contrasenia varchar(200),
    isAdmin tinyint(1),
    acces_token varchar (220),
    refresh_token varchar (220)
)engine=InnoDB auto_increment=1;

create table reserva(
	id int primary key not null auto_increment,
    fecha_reserva datetime,
     CHECK (fecha_reserva REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'),
    numero_artistas int,
    tipo_tema varchar(50),
    id_cliente int not null
)engine=InnoDB auto_increment=1;

create table cliente(
 id_usuario int primary key not null,
 aka varchar(50) unique key
)engine=InnoDB;

create table productor(
 id_usuario int primary key not null,
 nivel varchar(100)
)engine=InnoDB;

create table sesion(
	id int primary key not null auto_increment,
    id_cliente int not null,
    duracion int,
    fecha date
)engine=InnoDB auto_increment=1;

create table estado_boton(
	id varchar(200) primary key not null,
    ocupado boolean,
    reservado boolean
)engine=InnoDB;

create table mensajes(
	id int not null primary key auto_increment,
    nombre varchar(20),
	email varchar(50),
    mensaje varchar (200),
    contexto varchar (15)
)engine=InnoDB auto_increment=1;

-- relaciones
alter table sesion
add constraint sesion_cliente foreign key (id_cliente) references cliente (id_usuario);

alter table reserva
add constraint reserva_cliente foreign key (id_cliente) references cliente (id_usuario);

alter table cliente
add constraint cliente_usuario foreign key (id_usuario) references usuario (id);

alter table productor
add constraint productor_usuario foreign key (id_usuario) references usuario (id);

-- los insert

insert into usuario (nombre,gmail,contrasenia) values ("jhony","jhony@gmail.com","123@4_5"),("marcos","marcos@gmail.com","456@4_5"),
("tailer","tailer@gmail.com","7789@4_5");

insert into cliente (id_usuario,aka) values (1,"JH"),(2,"lil marcos"),(3,"T-king");

insert into productor (id_usuario,nivel) values (1,"master produccion"),(2,"ingeniero"),(3,"grado superior");

insert into reserva (fecha_reserva,numero_artistas,tipo_tema,id_cliente) values ("2019-01-08 16:30:00",2,"rap",1),
("2019-01-09 16:30:00",1,"rap",2),("2019-01-10 16:30:00",2,"rap",3);

insert into sesion (id_cliente,duracion,fecha) values (1,2,"2019-01-12"),(2,4,"2019-01-11"),
(3,3,"2019-01-21");


-- vista que me devuelve la sesion de hoy, ayer y mañana

CREATE VIEW SESION_POR_FECHA AS
	SELECT tabla.dia,tabla.aka,tabla.fecha_reserva
	FROM (
			SELECT 'AYER'as dia,c.aka,r.fecha_reserva
			FROM reserva r, cliente c
			Where r.id_cliente = c.id_usuario and 
			DATE(r.fecha_reserva) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            union
            SELECT 'HOY'as dia,c.aka,r.fecha_reserva
			FROM reserva r, cliente c
			Where r.id_cliente = c.id_usuario and 
			DATE(r.fecha_reserva) = curdate()
            union
            SELECT 'MAÑANA'as dia,c.aka,r.fecha_reserva
			FROM reserva r, cliente c
			Where r.id_cliente = c.id_usuario and 
			DATE(r.fecha_reserva) = DATE_ADD(curdate(), INTERVAL 1 DAY)
            union
            SELECT 'PASADO_MAÑANA'as dia,c.aka,r.fecha_reserva
			FROM reserva r, cliente c
			Where r.id_cliente = c.id_usuario and 
			DATE(r.fecha_reserva) = DATE_ADD(curdate(), INTERVAL 2 DAY)
	) AS tabla; 
    
-- vista que me devulve todas las reservas
CREATE VIEW reservas AS
	SELECT c.aka,r.fecha_reserva,r.numero_artistas,r.tipo_tema
    FROM reserva r, cliente c
    WHERE r.id_cliente = c.id_usuario
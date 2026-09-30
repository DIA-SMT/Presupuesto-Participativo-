-- El distrito lo declara la persona al votar. CIDITUC no informa el domicilio,
-- y la pantalla "Falta tu distrito" mandaba a una asamblea que no tenia como
-- cargarlo: con CIDITUC nadie podia votar. Ahora la persona busca su barrio o
-- marca su casa en el mapa (el calculo se hace en su navegador: ni la
-- direccion ni el punto llegan al servidor), tilda "Declaro que vivo en el
-- distrito N" y confirma. Lo puede cambiar hasta que vota.
--
--   votantes.distrito_declarado_en   cuando lo declaro (la ultima vez). Null si
--                                    el distrito vino de otro lado o si todavia
--                                    no eligio. Sirve para el informe de la
--                                    votacion: cuantos votos salieron de un
--                                    distrito declarado.
--
-- Solo agrega una columna que admite null, sin valor por defecto: no reescribe
-- la tabla ni toca ninguna fila. El codigo anterior no la lee, asi que se puede
-- aplicar antes de desplegar (y hay que hacerlo antes: el codigo nuevo la
-- escribe al declarar).

ALTER TABLE "votantes" ADD COLUMN "distrito_declarado_en" timestamp with time zone;
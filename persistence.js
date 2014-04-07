/**
 * Modulo de persistencia
 */
(function ($, SHURSCRIPT, localStorage, undefined) {
    'use strict';

    var Persist = {};
    SHURSCRIPT.Persist = Persist;


    /**
     * Devuelve un valor
     *
     * @param key Key a extraer
     * @param def Default value (opcional)
     */
    Persist.getValue = function (key, def) {
        var val = localStorage.getItem(key);


        if (val === undefined) {return def;}

        return JSON.parse(val);
    };

    /**
     * Guarda un par key-value
     *
     * @param key
     * @param value
     */
    Persist.setValue = function (key, value) {
        value = JSON.stringify(value);
        localStorage.setItem(key, value);

        Persist.setServerValue(key, value);
    };

    Persist.setServerValue = function (key, value) {

    };


    Persist.getAll = function () {};

    Persist.synchronize = function () {};

    Persist.getApiKey = function () {};

    Persist.setApiKey = function () {};

    Persist.generateApiKey = function (callback) {
        Persist.helper.deleteLocalValue("API_KEY");
        Persist.helper.log("Cloud.generateApiKey()");

        $.ajax({
            type: 'POST',
            url: this.server + 'preferences/',
            data: "",
            dataType: 'json'
        }).done(function (data) {
            Persist.helper.log("Generated API Key:" + JSON.stringify(data));
            Cloud.apiKey = data.apikey;
            saveApiKey(Cloud.apiKey); //guardamos la API key generada en las suscripciones
            callback();
        });
    };

    var Cloud = {
        server: SHURSCRIPT.config.server,
        apiKey: "",
        preferences: {}, //las preferencias sacadas del server

        setValue: function (key, value) {
            $.ajax({
                type: 'PUT',
                url: this.server + 'preferences/' + key + '/?apikey=' + this.apiKey,
                data: {'value': value},
                dataType: 'json'
            }).done(callback);
        },

        getValue: function (key) {
            $.ajax({
                type: 'get',
                url: this.server + 'preferences/' + key + '/?apikey=' + this.apiKey,
                data: "",
                dataType: 'json'
            }).done(callback);
        },

        getAll: function (callback) {
            SHURSCRIPT.config.apiKey = this.apiKey;

            Persist.helper.log("Cloud.getAll() using API key: " + this.apiKey);
            $.ajax({
                type: 'get',
                url: this.server + 'preferences/?apikey=' + this.apiKey,
                data: "",
                dataType: 'json'
            })
                .done(function (data) {
                    Cloud.preferences = data;
                    callback();
                })
                .fail(function(error){
                    switch (error.status) {
                        case 403:
                            bootbox.confirm("<h3>¡Un momento!</h3>La Shurkey que estás utilizando no es válida ¿Quieres que te generemos una nueva?", function(res){
                                if (res) {
                                    Cloud.generateApiKey(function () {
                                        Cloud.getAll(callback);
                                    });
                                }
                            });
                            break;
                        case 500:
                        default:
                            Persist.helper.showMessageBar({message: "<strong>Oops...</strong> Parece que hay tormenta en el cloud de Shurscript... Prueba de nuevo en unos instantes o deja constancia en el <a href='" + SHURSCRIPT.config.fcThread + "'>hilo oficial</a>.", type: "danger"});
                            break;
                    }
                    throw({name: 'ServerError', message: "Error al recuperar las preferencias"});
                });
        }
    };

    //Punto de entrada al componente.
    Persist.loadAndCallback = function (callback) {
        //sobreescribimos las funciones de manejo de preferencias
        // [cb] es opcional, se ejecuta una vez los datos se guardan en el servidor asíncronamente
        SHURSCRIPT.GreaseMonkey.setValue = function (key, value, cb) {
            Cloud.preferences[key] = value; //Copia local
            Cloud.setValue(key, value, cb);
        };

        SHURSCRIPT.GreaseMonkey.getValue = function (key, defaultValue) {
            //utilizamos la copia local de esa clave (si leyésemos del server los getValue serían asíncronos)
            return (Cloud.preferences[key] != undefined) ? Cloud.preferences[key] : defaultValue;
        };

        SHURSCRIPT.GreaseMonkey.deleteValue = function (key, callback) {
            Cloud.deleteValue(key, callback);
        };

        //ahora necesitamos la API key. ¿existe ya una API Key guardada en las suscripciones?
        var apiKey = getApiKey();
        if (apiKey) {
            //tenemos apikey, usémosla
            Cloud.apiKey = apiKey;
            Cloud.getAll(callback);//una vez recuperadas las preferencias notificamos al core para que cargue el siguiente componente
        } else {
            //hay que pedirle una al server y guardarla en las suscripciones
            //una vez tengamos la apiKey, la usamos
            Cloud.generateApiKey(function () {
                Cloud.getAll(callback); //notificamos al core, el siguiente componente ya puede cargar
            });
        }

    };

    Persist.generateApiKey = function(callback) {
        Cloud.generateApiKey(callback);
    }

    /**
     * Devuelve la API key guardada en las suscripciones del foro.
     */
    function getApiKey() {
        var apiKey = Persist.helper.getLocalValue("API_KEY");

        //Si no la tenemos guardada en local la buscamos en las suscripciones y la guardamos en local para evitar hacer cada vez una llamada para recuperar las suscripciones
        if (!apiKey) {
            var ajax = new XMLHttpRequest();
            ajax.open("GET", "http://www.forocoches.com/foro/subscription.php?do=editfolders", false); //La buscamos en la carpeta falsa que se crea en las suscripciones
            ajax.onreadystatechange = function () {
                if (ajax.readyState == 4 && ajax.statusText == "OK") {
                    var documentResponse = $.parseHTML(ajax.responseText);
                    var folder = $(documentResponse).find("input[name='folderlist[50]']");
                    if (folder.length > 0) {
                        //la API key existe
                        apiKey = folder.val().replace("shurkey-", "");
                        Persist.helper.setLocalValue("API_KEY", apiKey);
                    }
                }
            }
            ajax.send();
        }
        return apiKey;
    }

    /**
     * Guarda la API key en las suscripciones
     * Comprueba que el guardado sea exitoso. En caso contrario insiste una y otra vez...
     */
    function saveApiKey(apiKey) {
        var ajax = new XMLHttpRequest();
        ajax.open("POST", "http://www.forocoches.com/foro/subscription.php?do=doeditfolders", false);
        ajax.onreadystatechange = function () {
            if (ajax.readyState == 4 && ajax.statusText == "OK") {
                if (getApiKey() == false) { //comprobamos que se ha guardado. si no se ha guardado
                    saveApiKey(apiKey); //insistimos, hasta que se guarde o algo pete xD
                }
            }
        }
        var folderName = "shurkey-" + apiKey;
        var securitytoken = $("input[name='securitytoken']").val(); //Numero de seguridad que genera el vbulletin para autenticar las peticiones
        var params = "s=&securitytoken=" + securitytoken + "&do=doeditfolders&folderlist[50]=" + folderName + "&do=doeditfolders";
        ajax.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        ajax.setRequestHeader("Content-length", params.length);
        ajax.setRequestHeader("Connection", "close");
        ajax.send(params); //Creamos la carpeta
    }

})(jQuery, SHURSCRIPT, window.localStorage);

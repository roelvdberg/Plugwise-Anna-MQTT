require('dotenv').load();
const parser      = require('xmldom').DOMParser;
const xpath   	  = require('xpath');
const mqtt        = require('mqtt');
const agent 	  = require('agentkeepalive');
const request 	  = require('request');
const math  	  = require('mathjs');

const contr_host  = process.env['CONTR_HOST'];
const contr_port  = process.env['CONTR_PORT'];
const contr_user  = process.env['CONTR_USERNAME'];
const contr_pass  = process.env['CONTR_PASSWORD'];
const mqtt_s_base = process.env['MQTT_S_BASE'];

const anna_ip     = process.env['ANNA_IP'];
const anna_pass   = process.env['ANNA_PASSWORD'];
const mqtt_p_base = process.env['MQTT_P_BASE'];

const interval	  = process.env['INTERVAL'];

const prec_1      = process.env['PRECISION_1'].split(",");
const prec_05     = process.env['PRECISION_05'].split(",");
const prec_01     = process.env['PRECISION_01'].split(",");
const ignore	  = process.env['IGNORE'].split(",");

// Local caching
const cache = {
		setpoint: "0",
		temperature: "0",
		illuminance: "0",
		water_pressure: "0",
		boiler_temperature: "0",
		heating_state: "off",
		domestic_temperature: "0",
		appliance_id: "initial"
	};

const keepaliveAgent = new agent({
		maxSockets: 1,
		//maxFreeSockets: 10,
		timeout: 60000, // active socket keepalive for 60 seconds
		freeSocketTimeout: 30000, // free socket keepalive for 30 seconds
	});	
						
const mqtt_options = { port: contr_port,
					   host: contr_host,
					   username: contr_user,
					   password: contr_pass, 
					   rejectUnauthorized: false,
					   reconnectPeriod: 1000 };
	
// First execution, get the appliance_id
request_anna(false);

// Connect with the MQTT broker, this starts the main processing
const client = mqtt.connect( contr_host, mqtt_options );

// Client is connected now
client.on('connect', () => {	
	console.log(`Connected with host: ${contr_host}`);
	cache.setpoint = "0";
	cache.temperature = "0";
	cache.illuminance = "0";
	cache.water_pressure = "0";
	cache.boiler_temperature = "0";
	cache.heating_state = "off";
	cache.domestic_temperature = "0";
	
	// Subscribe on changes from the setpoint in the controller 
	const subject = `${mqtt_s_base}setpoint`;
	console.log(`Subscribing to subject ${subject}`);
	client.subscribe(subject, function() {});	
	
	// Call the endpoint every X seconds
	setInterval(() => { request_anna(true) }, interval * 1000);
});

// when a message arrives, do something
client.on('message', function(topic, message) {				
	send_setpoint(message.toString());
});

// Get the post parameters
function get_post_options(){
	return {  	host: anna_ip,
				port: 80,
				method: 'POST',
				path: `/core/appliances;id=${cache.appliance_id}/thermostat`,
				auth: `smile:${anna_pass}`
			};
}

// Check if the data has changed
function changed(data, field){
	
// Check the ignore list
	if (ignore.indexOf(field) > -1) {
		return;
	}
// Round if needed
	data = round(data, field);
	
	if (data != cache[field]){
		cache[field] = data;
		return true;
	}
	else{
		return false;
	}
}

function round(data, field){	
	if (prec_1.indexOf(field) > -1) {
		return math.round(data).toString();
	}
	if (prec_05.indexOf(field) > -1) {
		return (Math.round((data)*2)/2).toString();
	}
	if (prec_01.indexOf(field) > -1) {
		return (Math.round((data)*10)/10).toString();
	}
	return data;
}

// Connect with the mqtt broaker
function mqtt_connect(){
	client = mqtt.connect(`https://${contr_ip}:${contr_port}`,
							options = { username: contr_user, 
									    password: contr_pass, 
										rejectUnauthorized: false });
}

// Publish the changed data
function publish_change(field){
	const subject = mqtt_p_base + field;
	
	console.log(`${field} publishing: ${cache[field]} to ${subject}`);
	client.publish(subject, cache[field]).toString();
}

// Get the XML data from the thermostat
function request_anna(publish) {
	request({ method: 'GET'
			, uri: `http://smile:${anna_pass}@${anna_ip}:80/core/appliances`
			, agent: keepaliveAgent
			, forever: true }
			, function (error, response, body) {
				// On the first call skip the publish step
				if (publish === true){
					publish_changes(body);
				}
			}
	);
}

function publish_changes(body){
	try {
		// Parse the XML document
		const doc = new parser().parseFromString(body);
		
		if (changed( xpath.select("string(/appliances/appliance[name='Anna']/@id)", doc), 'appliance_id')){
			// This caches the value
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Anna']/actuator_functionalities/thermostat_functionality/setpoint)", doc), 'setpoint' )){
			publish_change( 'setpoint' );
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Anna']/logs/point_log[type='temperature']/period/measurement[1]/child::text())", doc), 'temperature' )){
			publish_change( 'temperature' );
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Anna']/logs/point_log[type='illuminance']/period/measurement[1]/child::text())", doc), 'illuminance' )){
			publish_change( 'illuminance' );
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Central heating boiler']/logs/point_log[type='central_heater_water_pressure']/period/measurement[1]/child::text())", doc), 'water_pressure' )){
			publish_change( 'water_pressure' );
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Central heating boiler']/logs/point_log[type='boiler_temperature']/period/measurement[1]/child::text())", doc), 'boiler_temperature' )){
			publish_change( 'boiler_temperature' );
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Central heating boiler']/logs/point_log[type='central_heating_state']/period/measurement/child::text())", doc), 'heating_state' )){
			publish_change( 'heating_state' );
		}
		if (changed( xpath.select("string(/appliances/appliance[name='Central heating boiler']/logs/point_log[type='domestic_hot_water_temperature']/period/measurement/child::text())", doc), 'domestic_temperature' )){
			publish_change( 'domestic_temperature' );
		}
		
	} catch (e) {
		console.error(e.message);
	}
}

function send_setpoint(setpoint){
	console.log(`Setpoint received: ${setpoint}`);
	
	request({ method: 'POST'
			, uri: `http://smile:${anna_pass}@${anna_ip}:80/core/appliances;id=${cache.appliance_id}/thermostat`
			, agent: keepaliveAgent
			, forever: true
			, json: false
			, body: `<?xml version='1.0'?><thermostat_functionality><setpoint>${setpoint}</setpoint></thermostat_functionality>`
			, function (error, response, body) {
				console.log(`Problem with request: ${response}`);
			}
	});
	
	if (changed(setpoint, 'setpoint')){
		// Publish the setpoint has been changed
		publish_change( 'setpoint' );
	}
}
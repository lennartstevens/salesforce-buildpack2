'use strict';

console.log('inside app.js');
console.log('env',process.env);

// ==============================================
// Load libraries
// ==============================================

const jsforce  = require('jsforce');
const express  = require('express');
const url      = require('url');
const util     = require('util');
// https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
// https://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js
const exec     = util.promisify(require('child_process').exec);


// Salesforce OAuth Settings (reusable)
// ==============================================

var oauth2 = new jsforce.OAuth2({
    'loginUrl' : process.env.OAUTH_SALESFORCE_LOGIN_URL,
    'clientId' : process.env.OAUTH_SALESFORCE_CLIENT_ID,
    'clientSecret' : process.env.OAUTH_SALESFORCE_CLIENT_SECRET,
    'redirectUri' : process.env.OAUTH_SALESFORCE_REDIRECT_URI
});


// ==============================================
// Configure web app to respond to requests
// ==============================================

var app = express();

app.listen( process.env.PORT || 8080 );

app.get( '/', function( req, res ) {

    // TODO need a separate heroku app that does this oauth dance
    //      and when it receives the auth code, it needs to pass
    //      it to the URL extracted from the 'state' url param.
    //      for security against MITM, the state value should be encrypted, for getting started it'll be plain text.
    //      this design ensures we only need one connected app in the dev hub that can handle all heroku apps.
    //      this design is also necessary because 'review apps' clone all the config vars from the 'dev app',
    //      so it's at this point when this code is running on the 'review app' that we need to look at
    //      the heroku config vars (env) and determine our url and put that in the state param

    var authURL = new URL( oauth2.getAuthorizationUrl( { scope : 'id' } ) );

    authURL.searchParams.append( 'state', JSON.stringify({
        'redirectURL' : 'https://' + process.env.HEROKU_APP_NAME + '.herokuapp.com'
    }));

    res.redirect( authURL );

});

/**
 * Receives oauth callback from Salesforce, hopefully, with authorization code.
 */
app.get( '/oauth2/callback', function( req, res ) {

    // in testing, browsers would send a duplicate request after 5 seconds
    // if this redirection did not respond in time.
    // to avoid having a duplicate request we must tell the browser to wait longer
    // https://github.com/expressjs/express/issues/2512
    req.connection.setTimeout( 1000 * 60 * 10 ); // ten minutes

    var requestURL = new URL( url.format({
        'protocol' : req.protocol,
        'hostname' : req.hostname,
        'pathname' : req.path,
        'query' : req.query
    }));
    console.log('requestURL', requestURL);

    var state = JSON.parse( req.query.state );
    console.log('state', state);

    var redirectURL = new URL( state.redirectURL );
    console.log('redirectURL', redirectURL);

    // if we are on the server where we are redirecting, then do our magic
    // else, redirect on to the intended heroku app
    if ( redirectURL.hostname === requestURL.hostname ) {

        // initialize salesforce client for making the oauth authorization request
        var sfClient = new jsforce.Connection({ oauth2 : oauth2 });

        // salesforce oauth authorize request to get access token
        sfClient.authorize( req.query.code, function( err, userInfo ) {

            if ( err ) {

                handleError( err, res );

            } else {

                try {

                    // TODO get from heroku config the org this pipeline's stage represents
                        // use 'exec' to run sfdx command

                    // TODO use sfdx cli to auth into that org
                    // TODO use sfdx cli to display url to get into the org
                    // TODO use express to redirect to the org's url

                    // debug, remove these lines later
                    console.log( 'userInfo', userInfo );
                    res.redirect( userInfo.url );

                } catch ( err ) {

                    handleError( err, res );

                }

            }

        });

    } else {

        console.log('redirecting to desired host');

        redirectURL.pathname = '/oauth2/callback';
        redirectURL.searchParams.append( 'state', req.query.state );
        redirectURL.searchParams.append( 'code', req.query.code );

        console.log('redirecting to: ' + redirectURL.toString());
        res.redirect( redirectURL.toString() );

    }

});

/**
 * Helper function to log error to console then write to response.
 */
function handleError( err, res ) {

    console.error( err );

    res.status( 403 ).send( 'Unexpected internal error' );

};
var absoluter = require('./absoluter');
absoluter('https://www.facebook.com/')
    .then(function(html){
        console.log(html);
    })
    .fail(function(err){
        console.log(err);
    });

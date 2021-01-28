const puppeteer = require('puppeteer');
const fs = require('fs');



function getProductData(link) {

    let prodotto = {};

    (async () => {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(link, {
            waitUntil: 'networkidle0',
        });
        
        //Prende il titolo
        const titolo = await page.$('#productTitle');
        prodotto.title = (await (await titolo.getProperty('innerHTML')).jsonValue()).trim()
        
        //Prende il prezzo
        const prezzo = await page.$('#priceblock_ourprice');
        prodotto.price = (await (await prezzo.getProperty('innerHTML')).jsonValue()).trim().split('&')[0];
        
        //Prendo la descrizione

        const puntiDescrizione = await page.$$('ul.a-unordered-list:nth-child(3) > li > span');
        let descrizione = "";
        for (const bullet of puntiDescrizione) {
            let strBullet = await (await bullet.getProperty('innerHTML')).jsonValue()
            if (strBullet.includes('span'))
                continue;
            descrizione += strBullet.trim() + "\n";
        }
        prodotto.decription = descrizione;

        //Prende i link delle immagini
        let bodyHTML = await page.evaluate(() => document.body.innerHTML);
        bodyHTML = bodyHTML.substring(bodyHTML.indexOf("colorImages"), bodyHTML.indexOf("'colorToAsin"));
        bodyHTML = bodyHTML.substring(bodyHTML.indexOf('{'), bodyHTML.lastIndexOf('}')) + '}';
        let arr = bodyHTML.split(':');
        let re = /'/gi
        arr[0] = arr[0].replace(re, '"');
        bodyHTML = arr.join(':');
        const photos = JSON.parse(bodyHTML).initial;
        prodotto.images = []
        for(const photo of photos) {
            prodotto.images.push(photo.large);
        }


        await browser.close();

        console.log(prodotto);
    })();


}

function test(ciao) {
    console.log("Importo correttamente "+ciao);
}

module.exports = {
    test
}

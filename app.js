const puppeteer = require('puppeteer');
const storeID = 'A1A3TU6YFANAX2';
const shopUrl = "https://www.amazon.it/s?me=" + storeID;
const userAgent = require('user-agents');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(shopUrl, {
        waitUntil: 'networkidle0',
    });
    /*
    //await page.screenshot({path: 'screenshots/buddy-screenshot.png'});
    const elements = await page.$$('.s-asin');

    let productsUrls = [];
    for (let i = 0; i < elements.length; i++) {
        console.log("Elemenrto " + i);
        const elemento = await (await elements[i].getProperty('innerHTML')).jsonValue();
        let link = elemento.split('<a');
        link = link.filter((str) => {
            return str.includes("href") && !str.includes("bestsellers")
        })
        link = link.map((str)=>{
            let regex = /href="(.*)"/gm;

            str = str.match(regex)[0];
            return str;
        })
        
        link = "https://www.amazon.it" + (link[0].replace('href="', '').replace('"', ''));
        productsUrls.push(link);
    }
    console.log(productsUrls);*/
    /*let products = await scrapeProdotti(productsUrls);
    console.log(products);*/
    console.log(await getNumOfPages(shopUrl));




    await browser.close();

    //console.log(products);
})();

async function getNumOfPages(link) {
    //Trovare il numero di pagine
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(link, {
        waitUntil: 'networkidle0',
    });

    const ulNumerberPages = await page.$$('.a-pagination > li');
    let numPages = await (await ulNumerberPages[ulNumerberPages.length - 2].getProperty('innerHTML')).jsonValue();
    await browser.close();
    if (numPages.includes('<a')) {
        //regex >(.*?)< prende solo quello che c'è nel link
        let regex = />(.*?)</
        numPages = numPages.match(regex)[0];
        numPages = numPages.substring(1, numPages.length-1)
    }
    return parseInt(numPages, 10);
}

async function scrapeProdotti(elencoLink) {
    let i = 0;
    let elencoProdotti = [];
    //Vai in tutte le pagine e estrai i prodotti
    for (const link of elencoLink) {
        //Per ogni link estrai i prodotti
        elencoProdotti.push(await getProductData(link, ++i));
    }
    return elencoProdotti;
}


async function getProductData(link, index) {
    console.log("Scraping prodotto " + index + " iniziato");



    let prodotto = {};

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(link, {
        waitUntil: 'networkidle0',
    });
    //await page.screenshot({path: 'screenshots/buddy-screenshot.png'});
    try {
        //Prende il titolo
        const titolo = await page.$('#productTitle');
        prodotto.title = (await (await titolo.getProperty('innerHTML')).jsonValue()).trim()

        //Prende il prezzo
        const prezzo = await page.$('#price_inside_buybox');
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
        for (const photo of photos) {
            prodotto.images.push(photo.large);
        }

    }
    catch (err) {
        console.log("Qualcosa è andato storto nell'articolo " + index);
        await page.screenshot({ path: 'screenshots/errore' + index + '.png' });
        console.log(err.message);
    }

    await browser.close();

    return prodotto;
}
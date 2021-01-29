const puppeteer = require('puppeteer');
const storeID = 'A37MY6ICG02J6Q';
const shopUrl = "https://www.amazon.it/s?me=" + storeID;
const userAgent = require('user-agents');
const fs = require('fs');

const { Cluster } = require('puppeteer-cluster');


(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(shopUrl, {
        waitUntil: 'networkidle0',
    });
    let numberOfPages = await getNumOfPages(shopUrl)
    //await page.screenshot({path: 'screenshots/buddy-screenshot.png'});

    let allProducts = [];
    for (let i = 1; i <= numberOfPages; i++) {
        console.log("Ottengo link della pagina " + i + "...")
        allProducts = allProducts.concat(await getAllProductForPage(shopUrl + '&page=' + i))
    }
    console.log("Fine ottenimento link\nSono stati trovati " + allProducts.length + " prodotti\nInizio scaping prodotti...");
    //console.log(allProducts);
    console.time('Scrape');
    let products = await scrapeProductsParallel(allProducts);
    console.timeEnd('Scrape');


    await browser.close();

    const data = JSON.stringify(products);
    fs.writeFile('exports/' + storeID + '.json', data, (err) => {
        if (err) {
            throw err;
        }
        console.log("JSON data is saved.");
    });

})();

async function getAllProductForPage(linkPage) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(linkPage, {
        waitUntil: 'networkidle0',
    });
    const elements = await page.$$('.s-asin');

    let productsUrls = [];
    for (let i = 0; i < elements.length; i++) {
        const elemento = await (await elements[i].getProperty('innerHTML')).jsonValue();
        let link = elemento.split('<a');
        link = link.filter((str) => {
            return str.includes("href") && !str.includes("bestsellers")
        })
        link = link.map((str) => {
            let regex = /href="(.*)"/gm;

            str = str.match(regex)[0];
            return str;
        })

        link = "https://www.amazon.it" + (link[0].replace('href="', '').replace('"', ''));
        productsUrls.push(link);
    }
    await browser.close();
    return productsUrls;
}

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
        numPages = numPages.substring(1, numPages.length - 1)
    }
    return parseInt(numPages, 10);
}

async function scrapeProductsParallel(productLinks) {
    // Create a cluster with 2 workers
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 6,
    });

    let prodotti = []

    // Define a task (in this case: screenshot of page)
    await cluster.task(async ({ page, data: url }) => {


        console.log("Scraping prodotto " + url + " iniziato");

        let prodotto = {};
        await page.setUserAgent(userAgent.toString())
        await page.goto(url, {
            waitUntil: 'networkidle0',
        });
        await page.screenshot({path: 'screenshots/buddy-screenshot.png'});
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
            console.log("Ecco il prodotto ");
            console.log(prodotto);

        }
        catch (err) {
            console.log("Qualcosa è andato storto nell'articolo " + index);
            await page.screenshot({ path: 'screenshots/errore' + index + '.png' });
            console.log(err.message);
        }
        
        prodotti.push(prodotto);
        await browser.close();
        
    });


    for (const link of productLinks) {
        // Add some pages to queue
        cluster.queue(link);
    }
    // Shutdown after everything is done
    await cluster.idle();
    await cluster.close();
    console.log(prodotti);
    console.log(prodotti.length)
    return prodotti;
}
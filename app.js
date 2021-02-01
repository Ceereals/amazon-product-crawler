const puppeteer = require('puppeteer');

const userAgent = require('user-agents');
const fs = require('fs');
const os = require('os')
const numCPU = os.cpus().length
const cors = require('cors');
const express = require('express');
const app = express();
const { Cluster } = require('puppeteer-cluster');

const PORT = 3000
app.use(cors())
app.get('/get-products/:shopID', async (req, res) => {
    res.send(await start(req.params.shopID));
})

app.listen(PORT, () => {
    console.log(`Example app listening at http://localhost:${PORT}`)
})

async function start(storeID) {
    //const storeID = 'A37MY6ICG02J6Q';
    const shopUrl = "https://www.amazon.it/s?me=" + storeID;

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(shopUrl, {
        waitUntil: 'networkidle0',
    });
    console.log('Parto');
    let numberOfPages = await getNumOfPages(shopUrl)
    let allProducts = await getProductsLinksParallel(shopUrl, numberOfPages);

    console.log("Fine ottenimento link\nSono stati trovati " + allProducts.length + " prodotti\nInizio scaping prodotti...");

    let products = await scrapeProductsParallel(allProducts);


    await browser.close();
    return JSON.stringify(products);
    /*
    const data = JSON.stringify(products);
    fs.writeFile('exports/' + storeID + '.json', data, (err) => {
        if (err) {
            throw err;
        }
        console.log("JSON data is saved.");
    });*/

}
/*
async function getAllProductForPage(linkPage) {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
*/
async function getNumOfPages(link) {
    //Trovare il numero di pagine
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(userAgent.toString())
    await page.goto(link, {
        waitUntil: 'networkidle0',
    });
    const ulNumerberPages = await page.$$('.a-pagination > li');
    console.log('Ho scaricato la pagina e preso la lista');
    if(ulNumerberPages.length == 0) {
        return 1;
    }
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

async function getProductsLinksParallel(shopUrl, numberOfPages) {
    // Create a cluster with 2 workers
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        maxConcurrency: numCPU,
    });

    let productsUrls = [];

    // Define a task
    await cluster.task(async ({ page, data: url }) => {
        await page.setUserAgent(userAgent.toString())
        await page.goto(url, {
            waitUntil: 'networkidle0',
        });
        const elements = await page.$$('.s-asin');


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

    });

    for (let i = 1; i <= numberOfPages; i++) {
        console.log("Ottengo link della pagina " + i + "...");
        cluster.queue(shopUrl + '&page=' + i);
    }

    // Shutdown after everything is done
    await cluster.idle();
    await cluster.close();
    return productsUrls;
}

async function scrapeProductsParallel(productLinks) {
    // Create a cluster with 2 workers
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        maxConcurrency: numCPU,
    });

    let prodotti = []

    // Define a task
    await cluster.task(async ({ page, data: url }) => {


        console.log("Scraping prodotto " + url + " iniziato");

        let prodotto = {};
        await page.setUserAgent(userAgent.toString())
        await page.goto(url, {
            waitUntil: 'networkidle0',
        });
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
            prodotto.description = descrizione;

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
            if (prodotto == null) {
                throw new Error('Qualcosa è andato storto nel prdotto ' + url);
            }
            prodotto.url = url;
        }
        catch (err) {
            await page.screenshot({ path: 'screenshots/errore ' + url + '.png' });
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
    return prodotti;
}
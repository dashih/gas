module.exports = {
    getProcessedData: getProcessedData
};

var math = require('mathjs');

function sortByDateInverse(carData) {
    return carData.sort((x, y) => {
        let d0 = new Date(x.date).getTime();
        let d1 = new Date(y.date).getTime();
        if (d0 < d1) {
            return 1;
        } else if (d0 > d1) {
            return -1;
        } else {
            return 0;
        }
    });
}

function calculateTimeBetweenList(carData) {
    if (carData.length < 2) {
        return [ 0.0 ];
    }

    let timeBetweenList = [];
    let prev = new Date(carData[0].date);
    for (let i = 1; i < carData.length; i++) {
        let cur = new Date(carData[i].date);

        // Weird! Because the array is inverse sorted.
        let diffInDays = ((((prev.getTime() - cur.getTime()) / 1000) / 60) / 60) / 24;
        timeBetweenList.push(diffInDays);
        prev = cur;
    }

    return timeBetweenList;
}

function process(carNode, carData) {
    let mpgList = [];
    let munnyList = [];
    let gallonsList = [];
    let milesList = [];
    let pricePerList = [];
    for (let i = 0; i < carData.length; i++) {
        let cur = carData[i];

        let mpg = cur.miles / cur.gallons;
        cur['mpg'] = mpg;
        mpgList.push(mpg);

        let munny = cur.gallons * cur.pricePerGallon;
        cur['munny'] = munny;
        munnyList.push(munny);

        gallonsList.push(cur.gallons);
        milesList.push(cur.miles);
        pricePerList.push(cur.pricePerGallon);
    }

    let sortedTransactionsList = sortByDateInverse(carData);
    let timeBetweenList = calculateTimeBetweenList(sortedTransactionsList);

    carNode['numTransactions'] = carData.length;
    carNode['avgMpg'] = math.mean(mpgList);
    carNode['stdDevMpg'] = math.std(mpgList);
    carNode['totalMunny'] = math.sum(munnyList);
    carNode['avgMunny'] = math.mean(munnyList);
    carNode['stdDevMunny'] = math.std(munnyList);
    carNode['totalGallons'] = math.sum(gallonsList);
    carNode['totalMiles'] = math.sum(milesList);
    carNode['avgMiles'] = math.mean(milesList);
    carNode['stdDevMiles'] = math.std(milesList);
    carNode['avgTimeBetween'] = math.mean(timeBetweenList);
    carNode['stdDevTimeBetween'] = math.std(timeBetweenList);
    carNode['avgPricePerGallon'] = math.mean(pricePerList);
    carNode['stdDevPricePerGallon'] = math.std(pricePerList);
    carNode['transactions'] = sortedTransactionsList;
}

function getProcessedData(rawData) {
    let accumulator = {};
    for (let prop in rawData) {
        if (rawData.hasOwnProperty(prop)) {
            accumulator[prop] = {};
            process(accumulator[prop], rawData[prop]);
        }
    }

    return accumulator;
}

module.exports = {
    process: process
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
        return null;
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

function process(carData) {
    let mpgList = [];
    let munnyList = [];
    let gallonsList = [];
    let milesList = [];
    let pricePerList = [];
    for (let i = 0; i < carData.length; i++) {
        let cur = carData[i];
        mpgList.push(cur.miles / cur.gallons);
        munnyList.push(cur.gallons * cur.pricePerGallon);
        gallonsList.push(cur.gallons);
        milesList.push(cur.miles);
        pricePerList.push(cur.pricePerGallon);
    }

    let sortedTransactionsList = sortByDateInverse(carData);
    let timeBetweenList = calculateTimeBetweenList(sortedTransactionsList);
    return {
        'numTransactions': carData.length,
        'mpgList': mpgList,
        'avgMpg': math.mean(mpgList),
        'stdDevMpg': math.std(mpgList),
        'munnyList': munnyList,
        'totalMunny': math.sum(munnyList),
        'avgMunny': math.mean(munnyList),
        'stdDevMunny': math.std(munnyList),
        'totalGallons': math.sum(gallonsList),
        'totalMiles': math.sum(milesList),
        'avgMiles': math.mean(milesList),
        'stdDevMiles': math.std(milesList),
        'avgTimeBetween': math.mean(timeBetweenList),
        'stdDevTimeBetween': math.std(timeBetweenList),
        'avgPricePerGallon': math.mean(pricePerList),
        'stdDevPricePerGallon': math.std(pricePerList),
        'transactions': sortedTransactionsList
    };
}

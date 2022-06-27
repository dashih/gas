const Status = Object.freeze({
    'None': 0,
    'Success': 1,
    'Processing': 2,
    'Error': 3
});

function reportStatus(status, msg) {
    document.getElementById('errorFooter').style.display = 'none';
    document.getElementById('successFooter').style.display = 'none';
    document.getElementById('processingFooter').style.display = 'none';
    switch (status) {
        case Status.Success:
            document.getElementById('successMsg').innerText = msg;
            document.getElementById('successFooter').style.display = 'block';
            setTimeout(() => {
                document.getElementById('successFooter').style.display = 'none';
            }, 2000);
            break;
        case Status.Processing:
            document.getElementById('processingFooter').style.display = 'block';
            break;
        case Status.Error:
            document.getElementById('errorMsg').innerText = msg;
            document.getElementById('errorFooter').style.display = 'block';
            break;
        default:
            break;
    }
}

function showForm(show) {
    reportStatus(Status.None, null);
    if (show) {
        document.getElementById('showFormDiv').style.display = 'none';
        document.getElementById('formDiv').style.display = 'block';
    } else {
        document.getElementById('formDiv').style.display = 'none';
        document.getElementById('showFormDiv').style.display = 'block';
    }
}

function showCarData(show) {
    if (show) {
        document.getElementById('summaryDiv').style.display = 'block';
        document.getElementById('transactionsDiv').style.display = 'block';
    } else {
        document.getElementById('summaryDiv').style.display = 'none';
        document.getElementById('transactionsDiv').style.display = 'none';
    }
}

async function updateCarData() {
    reportStatus(Status.Processing, null);

    const carSelector = document.getElementById('carSelector');
    const currentCar = carSelector.options[carSelector.selectedIndex].value;
    document.getElementById('currentCar').innerText = carSelector.options[carSelector.selectedIndex].text;
    const response = await fetch('/api/getCarData', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ car: currentCar })
    });
    if (response.ok) {
        const responseData = await response.json();
        const carData = responseData.carData;
        const lifetimeData = responseData['lifetimeData'];
        showCarData(false);
        if (carData.transactions.length === 0) {
            reportStatus(Status.Success, 'Nothing yet for this car');
            return;
        }

        // Populate car date range.
        document.getElementById('currentCarDateRange').innerText = 
            `${carData['dateRange']}
            ${lifetimeData['dateRange']} (lifetime)`;

        // Clear transactions table.
        const transactionsTableBody = document.getElementById('transactionsTable').getElementsByTagName('tbody')[0];
        transactionsTableBody.innerHTML = '';

        // Populate the table.
        for (let i = 0; i < carData.transactions.length; i++) {
            const cur = carData.transactions[i];
            const dateTime = new Date(cur.date).toLocaleString();
            const newRow = transactionsTableBody.insertRow();
            newRow.innerHTML = `
                <td>${dateTime}</td>
                <td>${cur.miles}</td>
                <td>${cur.gallons.toFixed(2)}</td>
                <td>${cur.mpg.toFixed(2)}</td>
                <td>${'$' + cur.pricePerGallon.toFixed(2)}</td>
                <td>${'$' + cur.munny.toFixed(2)}</td>
                <td>${cur.comments}</td>
                `;
        }

        // Populate summary table for the current car.
        document.getElementById('numFillups').innerText = carData.numTransactions;
        document.getElementById('mpg').innerText = `${carData.avgMpg.toFixed(2)} \xB1 ${carData.stdDevMpg.toFixed(2)}`;
        document.getElementById('mpgMaxMin').innerText = `${carData.minMpg.toFixed(2)} - ${carData.maxMpg.toFixed(2)}`;
        document.getElementById('totalMiles').innerText = parseFloat(carData.totalMiles.toFixed(2)).toLocaleString();
        document.getElementById('totalGallons').innerText = parseFloat(carData.totalGallons.toFixed(2)).toLocaleString();
        document.getElementById('totalMunny').innerText = `$${parseFloat(carData.totalMunny.toFixed(2)).toLocaleString()}`
        document.getElementById('timeBetween').innerText = `${carData.avgTimeBetween.toFixed(2)} days`;
        document.getElementById('munnyPerFillup').innerText = `$${carData.avgMunny.toFixed(2)} \xB1 $${carData.stdDevMunny.toFixed(2)}`;
        document.getElementById('milesPerFillup').innerText = `${carData.avgMiles.toFixed(2)} \xB1 ${carData.stdDevMiles.toFixed(2)}`;
        document.getElementById('gallonsPerFillup').innerText = `${carData.avgGallons.toFixed(2)} \xB1 ${carData.stdDevGallons.toFixed(2)}`;
        document.getElementById('gasPrice').innerText = `$${carData.avgPricePerGallon.toFixed(2)} \xB1 $${carData.stdDevPricePerGallon.toFixed(2)}`;

        // Populate summary table for lifetime data.
        document.getElementById('numFillupsLifetime').innerText = lifetimeData.numTransactions;
        document.getElementById('mpgLifetime').innerText = `${lifetimeData.avgMpg.toFixed(2)} \xB1 ${lifetimeData.stdDevMpg.toFixed(2)}`;
        document.getElementById('mpgMaxMinLifetime').innerText = `${lifetimeData.minMpg.toFixed(2)} - ${lifetimeData.maxMpg.toFixed(2)}`;
        document.getElementById('totalMilesLifetime').innerText = parseFloat(lifetimeData.totalMiles.toFixed(2)).toLocaleString();
        document.getElementById('totalGallonsLifetime').innerText = parseFloat(lifetimeData.totalGallons.toFixed(2)).toLocaleString();
        document.getElementById('totalMunnyLifetime').innerText = `$${parseFloat(lifetimeData.totalMunny.toFixed(2)).toLocaleString()}`
        document.getElementById('timeBetweenLifetime').innerText = `${lifetimeData.avgTimeBetween.toFixed(2)} days`;
        document.getElementById('munnyPerFillupLifetime').innerText = `$${lifetimeData.avgMunny.toFixed(2)} \xB1 $${lifetimeData.stdDevMunny.toFixed(2)}`;
        document.getElementById('milesPerFillupLifetime').innerText = `${lifetimeData.avgMiles.toFixed(2)} \xB1 ${lifetimeData.stdDevMiles.toFixed(2)}`;
        document.getElementById('gallonsPerFillupLifetime').innerText = `${lifetimeData.avgGallons.toFixed(2)} \xB1 ${lifetimeData.stdDevGallons.toFixed(2)}`;
        document.getElementById('gasPriceLifetime').innerText = `$${lifetimeData.avgPricePerGallon.toFixed(2)} \xB1 $${lifetimeData.stdDevPricePerGallon.toFixed(2)}`;

        showCarData(true);

        reportStatus(
            Status.Success,
            `Retrieved ${responseData.carData.transactions.length} entries in ${responseData['duration']} ms`);
    } else {
        reportStatus(Status.Error, `Error getting car data: ${response.status} - ${response.statusText} - ${await response.text()}`);
    }
};

document.getElementById('carSelector').onchange = async () => {
    await updateCarData();
};

document.getElementById('showFormButton').onclick = () => {
    showForm(true);
};

document.getElementById('hideFormButton').onclick = () => {
    showForm(false);
};

document.getElementById('canadaButton').onclick = async () => {
    if (document.getElementById('gallons').value === '' || document.getElementById('pricePerGallon').value === '') {
        document.getElementById('gallonsLabel').innerText = 'Liters';
        document.getElementById('pricePerGallonLabel').innerText = 'CAD per liter';
        return;
    }

    reportStatus(Status.Processing, null);
    const response = await fetch('/api/getCADRate');
    if (response.ok) {
        const jsonData = await response.json();
        const cadPerUsd = jsonData['cadPerUsd'];
        const gallonsPerLiter = 0.264172;

        const liters = document.getElementById('gallons').value;
        document.getElementById('gallons').value = liters * gallonsPerLiter;

        const cadPerLiter = document.getElementById('pricePerGallon').value / 100.0;
        document.getElementById('pricePerGallon').value = cadPerLiter / (cadPerUsd * gallonsPerLiter);

        reportStatus(Status.Success, 'Retrieved ' + cadPerUsd + ' CAD/USD');
    } else {
        reportStatus(Status.Error, `Error getting CAD rate: ${response.status} - ${response.statusText} - ${await response.text()}`);
    }
};

document.getElementById('submitButton').onclick = async () => {
    const carSelector = document.getElementById('carSelector');
    const currentCar = carSelector.options[carSelector.selectedIndex].value;

    const miles = parseFloat(document.getElementById('miles').value);
    const gallons = parseFloat(document.getElementById('gallons').value);
    const pricePerGallon = parseFloat(document.getElementById('pricePerGallon').value);
    const comments = document.getElementById('comments').value;
    if (isNaN(miles) || isNaN(gallons) || isNaN(pricePerGallon)) {
        alert('Invalid input!');
        return;
    }

    showForm(false);
    reportStatus(Status.Processing, null);

    const nonce = self.crypto.randomUUID();
    const payload = {
        'nonce': nonce,
        'car': currentCar,
        'miles': miles,
        'gallons': gallons,
        'pricePerGallon': pricePerGallon,
        'comments': comments
    };

    const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (response.ok) {
        const responseData = await response.json();
        reportStatus(Status.Success, `Posted in ${responseData.duration} ms! Reloading in 2s`);
        setTimeout(() => {
            updateCarData();
        }, 2000);
    } else {
        reportStatus(Status.Error, `Error submitting ${response.status} - ${response.statusText} - ${await response.text()}`);
    }
};

window.onload = async () => {
    // Set initial visibility states.
    showForm(false);
    showCarData(false);
    reportStatus(Status.None, null);

    // Populate versions only during page load.
    const response = await fetch('/api/getVersion');
    if (response.ok) {
        const versions = await response.json();
        document.getElementById('version').innerHTML =
            `v${versions.appVersion}
            <br />
            ${versions.osVersion} | Node.js ${versions.nodeVersion}
            <br />
            MongoDB ${versions.mongoVersion} | Bootstrap 5.0.2`;
    } else {
        reportStatus(Status.Error, `Error getting version info: ${response.status} - ${response.statusText} - ${await response.text()}`);
    }

    // Initial car data fetch.
    updateCarData();
};

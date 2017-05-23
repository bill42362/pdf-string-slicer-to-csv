#!/usr/bin/env node
'use strict';
const fs = require('fs');
const Pdfreader = require('pdfreader');
const targetColumns = require('./probes.js');
const reader = new Pdfreader.PdfReader();
const filenames = process.argv.slice(2);
const OUTPUT_FILE = 'result.csv';

const mapItemsToPages = (items) => {
    let pagingItems = items
    .map((item, index) => { if(item.page) { return {page: item.page, index: index}; } })
    .filter(item => !!item);
    return pagingItems.map((item, index) => {
        if(pagingItems[index + 1]) {
            return items.slice(item.index + 1, pagingItems[index + 1].index);
        } else {
            return items.slice(item.index + 1);
        }
    });
};
const mapItemsToLines = (items) => {
    const lines = items.reduce((current, item) => {
        let sameYObject = current.filter(object => 0.5 >= Math.abs(item.y - object.y))[0];
        const sameYObjectIndex = current.indexOf(sameYObject);
        if(sameYObject) {
            return [
                ...current.slice(0, sameYObjectIndex),
                Object.assign({}, sameYObject, {text: sameYObject.text + item.text}),
                ...current.slice(sameYObjectIndex + 1),
            ];
        } else {
            return [ ...current, {y: item.y, text: item.text} ];
        }
    }, []);
    return lines.sort((a, b) => (a.y > b.y ? 1 : -1))
};
const extractDataOfColumns = (items = [], targetColumns = []) => {
    let data = {};
    items.forEach(item => {
        let columns = targetColumns.filter(column => -1 !== item.text.indexOf(column.fromString));
        columns.forEach(column => {
            let csvColumnName = column.csvColumnName || column.fromString;
            let indexOfFromString = item.text.indexOf(column.fromString);
            let leftString = item.text.slice(indexOfFromString + column.fromString.length);
            let text = leftString;
            if(column.toString) {
                let indexOfToString = leftString.indexOf(column.toString);
                text = leftString.slice(0, indexOfToString);
            }
            data[csvColumnName] = data[csvColumnName] || text;
        });
    });
    return data;
};
const readfilePromise = (filename) => {
    return new Promise((resolve, reject) => {
        const items = [];
        reader.parseFileItems(filename, function(err, item) {
            if(err) {
                reject(err);
            } else if(!item) {
                resolve(items);
            } else { items.push(item); }
        });
    });
};

let columnNames = targetColumns.map(row => row.csvColumnName || row.fromString);
let outputBuffer = '';
outputBuffer += columnNames.join(',') + '\n';

filenames.forEach(filename => {
    readfilePromise(filename)
    .then(itemsOfFile => {
        const pagesOfFile = mapItemsToPages(itemsOfFile);
        const linesOfPagesOfFile = pagesOfFile.map(mapItemsToLines);
        const dataOfFile = linesOfPagesOfFile.reduce((currentObject, itemsOfPage, pageIndex) => {
            let rowsOfPage = targetColumns.filter(row => pageIndex + 1 === row.page);
            return Object.assign({}, currentObject, extractDataOfColumns(itemsOfPage, rowsOfPage));
        }, {});
        return new Promise(resolve => { resolve(dataOfFile); });
    })
    .then(data => {
        return new Promise((resolve, reject) => {
            let columnNames = targetColumns.map(row => row.csvColumnName || row.fromString);
            outputBuffer += columnNames.map(columnName => data[columnName]).join(',') + '\n';
            fs.writeFile(OUTPUT_FILE, outputBuffer, error => {
                if(error) { reject(error); }
                else {
                    console.log(outputBuffer);
                    outputBuffer = '';
                    resolve(data);
                }
            });
        });
    })
    .catch(error => { console.error('error:', error); });
});

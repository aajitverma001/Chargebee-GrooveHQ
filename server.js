var express = require('express');
var bodyParser = require('body-parser');
var url = require('url');
var S = require('string');
var m = require('moment');
var chargebee = require('chargebee');
var pluralize = require('pluralize')
require('dotenv').config();
var curr = "$";

var app = express();
app.use(express.static(__dirname));
chargebee.configure({
    site: process.env.CHARGEBEE_SITE,
    api_key: process.env.CHARGEBEE_API_KEY
});

app.get('/search', function (request, response) {
    var urlParser = url.parse(request.url, true);
    if (urlParser.query.api_token !== process.env.GROOVE_API_TOKEN) {
        return response.status(401).send("Unauthorized request. Please check api_token.");
    }
    return customerDetails(response, urlParser.query.email);
});

function customerDetails(resp, email) {
    if (typeof email === 'undefined' || typeof email === null) {
        resp.status(400).send("The email is the required field");
    }
    var customer, subscription;
    chargebee.customer.list({
        "limit": 1,
        "email[is]": email
    }).request().then(function (result) {
        if (result.list.length === 0) {
            return notFoundError(resp);
        }
        customer = result.list[0].customer;
        //fetch subscription for customer
        chargebee.subscription.list({
            "limit": 1,
            "customer_id[is]": customer.id
        }).request().then(function (subList) {
            if (subList.list.length > 0) {
                subscription = subList.list[0].subscription;
            }
            return createRespJson(customer, subscription, sendResponse(resp));
        });
    }).catch(function (error) {
        return notFoundError(resp);
    });
}

function sendResponse(resp) {
    return function (respJson) {
        return resp.status(200).send(respJson);
    };
}

function createRespJson(customer, subscription, endhook) {
    var respJson = {};
    console.log(JSON.stringify(subscription, null, 2));
    console.log(JSON.stringify(customer, null, 2));
    respJson.customer_name = n(customer.first_name, customer.last_name);
    respJson.customer_email = customer.email;
    respJson.customer_id = customer.id;
    respJson.customer_link = genLink('customers', customer.id);
    if (customer.card_status) {
        respJson.customer_card_status = S(customer.card_status).humanize().s;
    }
    if (subscription) {
        respJson.subscription_id = subscription.id;
        respJson.subscription_link = genLink('subscriptions', subscription.id);
        respJson.subscription_status = S(subscription.status).humanize().s;
        respJson.subscription_signed_up = dFmt(subscription.created_at);
        if (subscription.started_at) {
            respJson.subscription_started_at = dFmt(subscription.started_at);
        }
        if (subscription.start_date) {
            respJson.subscription_start_date = dFmt(subscription.start_date);
        }
        if (subscription.trial_end) {
            respJson.subscription_trial_end = dFmt(subscription.trial_end);
        }
        if (subscription.activated_at) {
            respJson.subscription_activated_at = dFmt(subscription.activated_at);
        }
        if (subscription.cancelled_at) {
            respJson.subscription_cancelled_at = dFmt(subscription.cancelled_at);
        }
    }
    return recurringItem(respJson, subscription, endhook);
}

function recurringItem(respJson, subscription, endhook) {
    return chargebee.plan.retrieve(subscription.plan_id).request(function (error, result) {
        if (error) {
            return endhook(respJson);
        } else {
            respJson.recurring_items = [];
            respJson.recurring_items.push(planDesc(result, subscription.plan_quantity));
            return endhook(respJson);
        }
    });
}

function planDesc(result, planQuantity) {
    var p = result.plan;
    return p.name + " (" + periodDisp(p.price, p.period, p.period_unit) + ") X " + planQuantity;
}

function periodDisp(price, period, periodUnit) {
    if (period) {
        var unit = period > 1 ? pluralize(S(periodUnit).humanize().s) : S(periodUnit).humanize().s;
        return money(price) + " / " + (period > 1 ? period + " " + unit : unit);
    } else {
        return "";
    }
}

function money(m) {
    return curr + (m / 100).toFixed(2);
}

function dFmt(timestamp) {
    return m.unix(timestamp).format("MMM Do YYYY, hh:mm");
}

function n(firstName, lastName) {
    var name = [];
    if (firstName) {
        name.push(firstName);
    }
    if (lastName) {
        name.push(lastName);
    }
    return name.join(" ");
}

function genLink(module, id) {
    return "https://" + process.env.CHARGEBEE_SITE + ".chargebee.com/admin-console/" + module + "/" + id;
}

function notFoundError(resp) {
    return resp.status(200).send({
        error_code: "customer_not_found",
        errr_message: "No details found"
    });
}

console.log("Starting on port: " + 3030);
app.listen(3030);

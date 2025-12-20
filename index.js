const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const crypto = require("crypto");
const port = process.env.PORT || 2031;

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const stripe = require("stripe")(process.env.STRIPE_API);

// middleware
app.use(express.json());
app.use(cors());

// importent
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster.sofxk3k.mongodb.net/?appName=Cluster`;

// generrate trx id
const generateTransactionId = () => {
  const timestamp = Date.now().toString(36); // compact, sortable time
  const randomPart = crypto.randomBytes(6).toString("hex");

  return `TXN-${timestamp}-${randomPart}`;
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const DB = client.db("assetVerse");
    const users = DB.collection("users");
    const assets = DB.collection("assets");
    const requests = DB.collection("requests");
    const employeeAffiliations = DB.collection("employeeAffiliations");
    const assignedAssets = DB.collection("assignedAssets");
    const packages = DB.collection("packages");
    const payments = DB.collection("payments");

    // ================================

    // get package data
    app.get("/packages", async (req, res) => {
      const result = await packages.find().toArray();
      res.send(result);
    });

    // post user data
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await users.insertOne(user);
      res.send(result);
    });
    // get user info via email
    app.get("/users", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res
          .send({
            error: "email query parameter is required for checking user role",
          })
          .status(400);
      }

      const result = await users.findOne({ email: email });
      if (!result) {
        return res.send({ error: "User not found" }).status(404);
      }

      res.send(result);
    });

    // add asset
    app.post("/assets", async (req, res) => {
      const asset = req.body;
      const result = await assets.insertOne(asset);
      res.send(result);
    });

    // get asset
    app.get("/assets", async (req, res) => {
      const email = req.query.email;
      const search = req.query.search;
      const id = req.query.id;
      const quantity = req.query.quantity;

      const query = {};

      if (email) {
        query.hrEmail = email;
      }

      if (id) {
        try {
          query._id = new ObjectId(id);
        } catch (err) {
          return res.status(400).send({ error: "Invalid asset ID format" });
        }
      }

      if (search) {
        query.productName = { $regex: search, $options: "i" };
      }

      // Apply quantity filter only if quantity_gt is provided
      if (quantity === "true") {
        query.availableQuantity = { $gt: 0 };
      }

      const hrAssets = await assets.find(query).toArray();
      res.send(hrAssets);
    });

    // delete data from asset
    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await assets.deleteOne(query);
      res.send(result);
    });

    //update
    app.patch("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateData = req.body;
      const update = {
        $set: updateData,
      };
      const result = await assets.updateOne(query, update);
      res.send(result);
    });

    app.post("/requests", async (req, res) => {
      const requestData = req.body;
      const result = await requests.insertOne(requestData);
      res.send(result);
    });

    // get requests
    app.get("/requests", async (req, res) => {
      const { requesterEmail, assetType, search, hrEmail, status } = req.query;
      const query = {};

      if (requesterEmail) {
        query.requesterEmail = requesterEmail;
      }
      if (hrEmail) {
        query.hrEmail = hrEmail;
      }
      if (status && status !== "all") {
        query.requestStatus = status;
      }

      if (search) {
        query.assetName = { $regex: search, $options: "i" };
      }

      if (assetType && assetType !== "all") {
        query.assetType = assetType;
      }

      const result = await requests.find(query).toArray();
      res.send(result);
    });

    // update (return) for employee
    app.patch("/requests/return/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateData = req.body;
      const update = {
        $set: updateData,
      };
      const result = await requests.updateOne(query, update);
      res.send(result);
    });

    // update status for hr
    app.patch("/requests/status/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateData = req.body;
      const { requestStatus, processedBy } = req.body;
      const update = {
        $set: updateData,
      };

      if (requestStatus === "approved") {
        const request = await requests.findOne({ _id: new ObjectId(id) });

        // Check affiliation
        const hrData = await users.findOne({ email: request.hrEmail });
        const employeeData = await users.findOne({
          email: request.requesterEmail,
        });
        const existingAffiliation = await employeeAffiliations.findOne({
          employeeEmail: request.requesterEmail,
          hrEmail: request.hrEmail,
          companyName: request.companyName,
          status: "active",
        });

        // Create affiliation if first time
        if (existingAffiliation) {
          await employeeAffiliations.updateOne(
            { _id: existingAffiliation._id },
            { $inc: { assetCount: 1 } }
          );

          const assetResult = await assets.updateOne(
            {
              _id: new ObjectId(request.assetId),
              availableQuantity: { $gt: 0 },
            },
            { $inc: { availableQuantity: -1 } }
          );

          if (assetResult.modifiedCount === 0) {
            return res.status(400).send({ message: "Asset out of stock" });
          }
        } else {
          // check package
          const totalEmployees = await employeeAffiliations.countDocuments({
            hrEmail: processedBy,
            status: "active",
          });

          if (totalEmployees >= hrData.packageLimit) {
            return res
              .status(400)
              .send({ message: "Employee limit reached. Upgrade package." });
          }

          await employeeAffiliations.insertOne({
            employeeEmail: request.requesterEmail,
            employeeName: request.requesterName,
            employeeLogo: employeeData.photoURL,
            hrEmail: request.hrEmail,
            companyName: request.companyName,
            companyLogo: hrData.companyLogo,
            assetCount: 1,
            affiliationDate: new Date(),
            status: "active",
          });

          const assetResult = await assets.updateOne(
            {
              _id: new ObjectId(request.assetId),
              availableQuantity: { $gt: 0 },
            },
            { $inc: { availableQuantity: -1 } }
          );

          if (assetResult.modifiedCount === 0) {
            return res.status(400).send({ message: "Asset out of stock" });
          }
        }

        await assignedAssets.insertOne({
          assetId: request.assetId,
          assetName: request.assetName,
          assetImage: request.assetImage,
          assetType: request.assetType,
          employeeEmail: request.requesterEmail,
          employeeName: request.requesterName,
          hrEmail: request.hrEmail,
          companyName: request.companyName,
          assignmentDate: new Date(),
          returnDate: null,
          status: "assigned",
        });
      }

      const result = await requests.updateOne(query, update);
      res.send(result);
    });

    ////
    ////
    ////
    ////
    ////

    app.get("/employeeAffiliations/companyName", async (req, res) => {
      const { companyName } = req.query;

      if (!companyName) {
        return res.status(400).send({ message: "companyName is required" });
      }

      const result = await employeeAffiliations
        .find(
          {
            companyName,
            status: "active",
          },
          {
            projection: {
              employeeName: 1,
              employeeEmail: 1,
              employeeLogo: 1,
              position: 1,
              affiliationDate: 1,
            },
          }
        )
        .toArray();

      res.send(result);
    });

    //////
    //////
    //////
    //////
    //////
    //////
    //////
    //////

    // employee affiliations
    app.get("/employeeAffiliations", async (req, res) => {
      const { hrEmail, employeeEmail } = req.query;

      const query = {};

      if (hrEmail) {
        query.hrEmail = hrEmail;
      }

      if (employeeEmail) {
        query.employeeEmail = employeeEmail;
      }

      if (!hrEmail && !employeeEmail) {
        return res.status(400).json({
          error: "hrEmail or employeeEmail query parameter is required",
        });
      }

      const result = await employeeAffiliations.find(query).toArray();
      res.send(result);
    });

    // delete data from asset
    app.delete("/employeeAffiliations/:email", async (req, res) => {
      const email = req.params.email;
      const query = { employeeEmail: email };
      const result = await employeeAffiliations.deleteOne(query);
      res.send(result);
    });
    // ============================

    app.get("/my-companies", async (req, res) => {
      const { employeeEmail } = req.query;

      if (!employeeEmail) {
        return res.status(400).send({ message: "employeeEmail is required" });
      }

      const companies = await employeeAffiliations.distinct("companyName", {
        employeeEmail,
        status: "active",
      });

      res.send(companies);
    });

    app.get("/team-birthdays", async (req, res) => {
      const { companyName } = req.query;

      if (!companyName) {
        return res.status(400).send({ message: "companyName is required" });
      }

      const currentMonth = new Date().getMonth() + 1;

      const birthdays = await employeeAffiliations
        .aggregate([
          {
            $match: {
              companyName,
              status: "active",
              dateOfBirth: { $exists: true },
            },
          },
          {
            $addFields: {
              birthMonth: { $month: "$dateOfBirth" },
            },
          },
          {
            $match: {
              birthMonth: currentMonth,
            },
          },
          {
            $project: {
              employeeName: 1,
              employeeEmail: 1,
              employeeLogo: 1,
              dateOfBirth: 1,
            },
          },
        ])
        .toArray();

      res.send(birthdays);
    });

    //============ STRIPE payment ====================

    app.post("/checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            // price: '{{PRICE_ID}}',
            quantity: 1,
            price_data: {
              currency: "USD",
              unit_amount: parseInt(paymentInfo.price) * 100,
              product_data: {
                name: `Subscription: ${paymentInfo.subscription}`,
                description: `Pay ${paymentInfo.price}$ to get this ${paymentInfo.subscription} package`,
              },
            },
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          packageId: paymentInfo.packageId,
          createdAt: new Date(),
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({ url: session.url });
    });

    //check payment success
    app.patch("/verify-payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const hrEmail = req.body.email;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        const id = session.metadata.packageId;
        const trackingId = generateTransactionId();

        // searching packeage
        const packageData = await packages.findOne({ _id: new ObjectId(id) });

        await payments.insertOne({
          hrEmail: hrEmail,
          packageId: id,
          packageName: packageData.name,
          employeeLimit: packageData.employeeLimit,
          amount: packageData.price,
          trackingId: trackingId,
          transactionId: session.payment_intent,
          status: session.payment_status,
          paymentDate: new Date(),
        });

        const query = { email: hrEmail };
        const update = {
          $set: {
            packageLimit: packageData.employeeLimit,
            subscription: packageData.name,
          },
        };

        const result = await users.updateOne(query, update);
        return res.send({
          modifiedPackage: result,
          trackingId: trackingId,
          transactionId: session.payment_intent,
          status: session.payment_status,
        });
      }
      res.send({ success: false });
    });

    //=================================
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Connected to AssetVerse server");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

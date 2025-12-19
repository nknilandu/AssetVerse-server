const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 2031;

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(express.json());
app.use(cors());

// importent
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster.sofxk3k.mongodb.net/?appName=Cluster`;

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

    // ================================

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
        query.productQuantity = { $gt: 0 };
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
      const { requestStatus } = req.body;
      const update = {
        $set: updateData,
      };

      if (requestStatus === "approved") {
        const request = await requests.findOne({ _id: new ObjectId(id) });
        const assetResult = await assets.updateOne(
          { _id: new ObjectId(request.assetId), availableQuantity: { $gt: 0 } },
          { $inc: { availableQuantity: -1 } }
        );

        if (assetResult.modifiedCount === 0) {
          return res.status(400).send({ message: "Asset out of stock" });
        }
      }

      const result = await requests.updateOne(query, update);
      res.send(result);
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

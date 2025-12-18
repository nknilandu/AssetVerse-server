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
      
      const query = { hrEmail: email };

      if (!email) {
        return res
          .status(400)
          .send({ error: "Email query parameter is required" });
      }

      const hr = await assets.findOne(query);
      if (!hr) {
        return res.status(404).send({ error: "HR not found" });
      }
      
      if (search) {
        query.productName = { $regex: search, $options: "i" };
      }

      const hrAssets = await assets.find(query).toArray();
      res.send(hrAssets);
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

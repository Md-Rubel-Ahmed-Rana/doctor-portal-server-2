const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require("express")
const cors = require("cors");
const jwt = require("jsonwebtoken")
require("dotenv").config()
const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Doctor Portal Server is running!!!")
})



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.n72f5gi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


const verifyJWT = async(req, res, next) => {
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(403).send({message: "unauthorized access"})
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if(err){
            return res.status(403).send({ message: "unauthorized access" })
        }
        req.decoded = decoded
        next()
    })

}


const server = async() => {
    try {
        const appointmentOptionsCollection = client.db("doctors-portal").collection("appointmentOptions")
        const bookingsCollection = client.db("doctors-portal").collection("bookings")
        const usersCollection = client.db("doctors-portal").collection("users")
        
        app.get("/appointmentOptions", async(req, res) => {
            const date = req.query.date;
            const query = {}
            const cursor = appointmentOptionsCollection.find(query);
            const options = await cursor.toArray()
            const bookinQuery = { appointmentDate : date};
            const alreadyBooked = await bookingsCollection.find(bookinQuery).toArray();

            options.forEach((option) => {
                const optionBooked = alreadyBooked.filter((book) => book.treatment === option.name);
                const bookedSlots = optionBooked.map((book) => book.slot);
                const remainingSlots = option.slots.filter((slot) => !bookedSlots.includes(slot))
                option.slots = remainingSlots
            })

            res.send(options)
        })

        app.get("/bookings", verifyJWT,  async(req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail){
                return res.status(403).send({ message: "unauthorized access" })
            }
            const query = {email: email};
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
        })

        app.get("/jwt", async(req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {expiresIn: "1h"});
                return res.send({accessToken: token})
            }
            return res.status(403).send({message: "unauthorized access"})
        })

        app.get("/users", async(req, res) => {
            const query = {}
            const users = await usersCollection.find(query).toArray();
            res.send(users)
        })

        app.get("/users/admin/:email", async(req, res) => {
            const email = req.params.email;
            const query = {email : email};
            const user = await usersCollection.findOne(query);

            res.send({isAdmin: user?.role === "admin"})
        })

        app.post("/bookings", async(req, res) => {
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if(alreadyBooked.length){
                const message = `You already have a booking on ${booking.appointmentDate}`;
                return res.send({acknowledged: false, message})
            }


            const result = await bookingsCollection.insertOne(booking);
            res.send(result)
        })

        app.post("/users", async(req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        app.put("/users/admin/:id", verifyJWT, async(req, res) => {
            const decodedEmail = req.decoded.email;
            const query = {email: decodedEmail};
            const user = await usersCollection.findOne(query);
            if(user.role !== "admin"){
                return res.status(403).send({message: "forbidden access"})
            }
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const option = {upsert: true};
            const updatedDoc = {
                $set: {role: "admin"}
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, option)
            res.send(result)
        })

    } catch (error) {
        console.log(error);
    }
}

server()


app.listen(port, () => console.log(`Doctor Portal Server is running on port ${port}`))
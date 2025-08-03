const express = require("express")
const app = express()
app.set('view engine','ejs')
app.get('/', (req,res)=>{

    // res.send("Hello")
    res.render("index")
});

app.listen(3000, ()=>{
    console.log("Listening on port 3000")
})
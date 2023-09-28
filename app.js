const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader != undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectQuery = ` select * from user where username ='${username}';`;
  const dbUser = await db.get(selectQuery);
  if (dbUser === undefined) {
    const createUser = `insert into user(username,password,name,gender) 
        values('${username}','${hashedPassword}','${name}','${gender}');`;
    console.log(password.length);
    if (password.length > 6) {
      await db.run(createUser);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectQuery = `select * from user where username ='${username}';`;
  const dbUser = await db.get(selectQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secretToken");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const followingUserId = async (username) => {
  const selectQuery = `select following_user_id from follower inner join user on 
  user.user_id = follower.follower_user_id  where user.username ='${username}';`;
  const followingUserIds = await db.all(selectQuery);
  const array0fIds = followingUserIds.map(
    (eachUser) => eachUser.following_user_id
  );
  console.log(array0fIds);
  return array0fIds;
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  console.log(username);
  const followingPeopleIds = await followingUserId(username);
  const tweetsQuery = `select user.username,tweet.tweet,tweet.date_time as dateTime from user 
    inner join tweet on user.user_id = tweet.user_id  where user.user_id in(${followingPeopleIds}) order by tweet.date_time DESC
     limit 4;`;
  const tweets = await db.all(tweetsQuery);
  response.send(tweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const followingPeopleIds = await followingUserId(username);
  const selectQuery = `select distinct user.name from user left join follower 
    on user.user_id = follower.follower_user_id where user.user_id in(${followingPeopleIds});`;
  const selectedRows = await db.all(selectQuery);
  response.send(selectedRows);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectQuery = `select distinct user.name from user inner join follower 
    on user.user_id = follower.follower_user_id where follower.following_user_id = (select user_id from 
        user where username ='${username}');`;
  const selectedRows = await db.all(selectQuery);
  response.send(selectedRows);
});

const tweetRequest = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  //const { userId } = request.query;
  const followingQuery = `select user_id from user inner join follower on user.user_id = 
    follower.following_user_id where follower.follower_user_id=(select user_id from 
        user where username='${username}');`;
  const userFollowing = await db.all(followingQuery);
  console.log(userFollowing);
  const followingArray = userFollowing.map((eachUser) => eachUser.user_id);
  console.log(followingArray);
  const getUserId = `select user_id from tweet where tweet_id = ${tweetId};`;
  const tweetUserId = await db.get(getUserId);
  console.log(tweetUserId.user_id);
  const idInArray = followingArray.includes(tweetUserId.user_id);
  console.log(idInArray);
  if (idInArray === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetRequest,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweet = `select tweet,count(distinct like.user_id) as likes,count(distinct 
        reply.user_id) as replies,tweet.date_time as dateTime from (tweet inner join like 
            on tweet.tweet_id = like.tweet_id)as T  
    inner join reply on T.tweet_id = reply.tweet_id where T.tweet_id=${tweetId};`;
    const data = await db.get(getTweet);
    console.log(data);
    response.send(data);
  }
);

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetRequest,
  async (request, response) => {
    const { tweetId } = request.params;
    const getUserName = `select user.username as likes from user inner join like 
    on like.user_id = user.user_id
    where like.tweet_id=${tweetId};`;
    const likedUsers = await db.all(getUserName);
    console.log(likedUsers);
    const usersArray = likedUsers.map((item) => item.likes);
    console.log(usersArray);
    response.send({ likes: usersArray });
  }
);

///API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetRequest,
  async (request, response) => {
    const { tweetId } = request.params;
    const selectQuery = `select name,reply from user inner join reply on user.user_id=reply.user_id
    where reply.tweet_id = ${tweetId};`;
    const replyNames = await db.all(selectQuery);
    response.send({ replies: replyNames });
    //console.log(replies);
  }
);

///API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectQuery = `select tweet,count(distinct like.like_id)as 
  likes,count(distinct reply.reply_id) as replies,tweet.date_time as dateTime from 
  tweet left join like on tweet.tweet_id = like.tweet_id left join reply on 
  tweet.tweet_id = reply.tweet_id where tweet.user_id =(select user_id from 
    user where username='${username}') group by tweet.tweet_id;`;
  const getTweets = await db.all(selectQuery);
  response.send(getTweets);
});

/// API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  //console.log(user_id);
  const insertQuery = `insert into tweet(tweet,user_id) values('${tweet}',
  (select user_id from user where username='${username}'));`;
  const newTweet = await db.run(insertQuery);
  response.send("Created a Tweet");
});

///API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    console.log(parseInt(tweetId));
    const { username } = request;
    //const { userId } = request.query;
    const userTweetIds = await db.all(
      `select tweet_id from tweet where user_id=(select user_id from user 
        where username='${username}');`
    );
    //console.log(userTweetIds);
    //console.log(userTweetIds[0]);
    const onlyTweetIds = userTweetIds.map((item) => item.tweet_id);
    console.log(onlyTweetIds);
    const checkTweetId = onlyTweetIds.includes(parseInt(tweetId));
    console.log(checkTweetId);
    if (checkTweetId === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `delete from tweet where tweet_id = ${tweetId};`;
      await db.get(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;

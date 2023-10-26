const express = require('express');
const app = express();
const os = require('os');
const axios = require("axios");
const cheerio = require('cheerio');
const Botly = require("botly");
const botly = new Botly({
    accessToken: process.env.PAGE_ACCESS_TOKEN,
    verifyToken: process.env.VERIFY_TOKEN,
    webHookPath: process.env.WB_PATH,
    notificationType: Botly.CONST.REGULAR,
    FB_URL: "https://graph.facebook.com/v2.6/",
});

const botVer = "1.0";

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false} });

const headers = {
  "accept": "application/json",
  "Cookie":"token=369655189:2:1697695251:xbyyOCRI-aOklMbmBBxWVcmOY2zHjdfsNInsgH-Qvaq473nkhAF6gD5VaKMMZTHk;" 
}
const headers2 = {
  "accept": "application/json"
}
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.json({ verify: botly.getVerifySignature(process.env.APP_SECRET) }));
app.use(express.urlencoded({ extended: false }));
app.use("/webhook", botly.router());

function formatBytes(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
}

app.get("/", (req, res) => {
  const memoryUsage = process.memoryUsage();
  let uptimeInSeconds = process.uptime();

  let uptimeString = "";
  if (uptimeInSeconds < 60) {
    uptimeString = `${uptimeInSeconds.toFixed()} seconds`;
  } else if (uptimeInSeconds < 3600) {
    uptimeString = `${(uptimeInSeconds / 60).toFixed()} minutes`;
  } else if (uptimeInSeconds < 86400) {
    uptimeString = `${(uptimeInSeconds / 3600).toFixed()} hours`;
  } else {
    uptimeString = `${(uptimeInSeconds / 86400).toFixed()} days`;
  }

  const osInfo = {
    totalMemoryMB: (os.totalmem() / (1024 * 1024)).toFixed(2),
    freeMemoryMB: (os.freemem() / (1024 * 1024)).toFixed(2),
    cpus: os.cpus(),
  };

  res.render("index", { memoryUsage, uptimeString, formatBytes, osInfo });
});

/* ----- DB Qrs ----- */
async function createUser(user) {
    const { data, error } = await supabase
        .from('users')
        .insert([ user ]);
  
      if (error) {
        throw new Error('Error creating user : ', error);
      } else {
        return data
      }
  };
  
  async function updateUser(id, update) {
    const { data, error } = await supabase
      .from('users')
      .update( update )
      .eq('uid', id);
  
      if (error) {
        throw new Error('Error updating user : ', error);
      } else {
        return data
      }
  };
  
  async function userDb(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('uid', userId);
  
    if (error) {
      console.error('Error checking user:', error);
    } else {
      return data
    }
  };

async function getStory(id) {
  try {
    const response = await axios.get(`https://www.wattpad.com/apiv2/?m=storytext&id=${id}`);
    const html = response.data;
  
    const $ = cheerio.load(html);
    const textArray = [];
  
    $('p').each((index, element) => {
      const text = $(element).text().trim();
      if (text) {
        textArray.push(text);
      }
    });
    const scrapedText = textArray.join('\n');
    return scrapedText;
  } catch (error) {
      console.error('An error occurred while scraping the content:', error);
  }
  };
  
botly.on("message", async (senderId, message) => {
  const timer = (ms) => new Promise((res) => setTimeout(res, ms));
  if (message.message.text) {
    const user = await userDb(senderId);
    if (user[0]) {
      if (user[0].os == null) {
        botly.sendText({
          id: senderId,
          text: "لم يتم إختيار المنصة !\nماهي المنصة التي تستعملها ؟ 📱",
          quick_replies: [
            botly.createQuickReply("Messenger 💬", "messenger"),
            botly.createQuickReply("Lite 🗨️", "lite")
          ],
        });
      } else if (user[0].lang == null) {
        botly.sendText({
          id: senderId,
          text: "لم تقم بإختيار لغة !\nماهي اللغة التي تفضلها للقراءة 🌐 ؟",
          quick_replies: [
            botly.createQuickReply("العربية 🇩🇿", "16"),
            botly.createQuickReply("الانجليزية 🇺🇸", "1")
          ],
        });
      } else if (user[0].name == null) {
        if (message.message.text.length <= 15) {
          botly.sendText({
            id: senderId,
            text: `هل تريد إستعمال (${message.message.text}) كإسم خاص بك ؟ 👀`,
            quick_replies: [
              botly.createQuickReply("قبول ✅", message.message.text),
              botly.createQuickReply("رفض ❎", "rename"),
              botly.createQuickReply("تخطي ⬅️", "skip")
            ],
          });
        } else {
          botly.sendText({
            id: senderId,
            text: "عفواً 🤕\nلا يمكن للإسم أن يكون أطول من 15 حرف! جرب كتابة إسمك الحقيقي 🪪",
            quick_replies: [
              botly.createQuickReply("تخطي ⬅️", "skip")
            ],
          });
        }
      } else {
        if (message.message.text.length <= 3) {
          if (message.message.text.length < 3 && !isNaN(message.message.text)) {
            if (user[0].pad != null) {
              var pi = parseInt(message.message.text);
              const read = await axios.get(`https://www.wattpad.com/api/v3/stories/${user[0].pad}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`, { headers : headers2});
              
              if (pi <= read.data.numParts) {
                var text = await getStory(read.data.parts[pi - 1].id);
                
                const parts = [];
                let currentPart = '';
                
                const words = text.split(' ');
                
                for (const word of words) {
                  if ((currentPart + ' ' + word).length <= 2000) {
                    currentPart += (currentPart ? ' ' : '') + word;
                  } else {
                    parts.push(currentPart);
                    currentPart = word;
                  }
                }
                if (currentPart) {
                  parts.push(currentPart);
                }
                
                for (const part of parts) {
                  botly.sendText({ 
                    id: senderId,
                    text: part,
                    quick_replies: [
                      botly.createQuickReply("الجزء التالي ◀️", `${user[0].pad}-${pi +1}`)
                    ],
                  });
                  await timer(1500);
                }
              } else {
                botly.sendButtons({
                  id: senderId,
                  text: `خطأ! 🙃\nالرواية التي تقرأها الان فيها (${read.data.numParts}) اجزاء! يرجى كتابة رقم جزء معين تريده. 😅`,
                  buttons: [
                  botly.createPostbackButton("ترشيحات ⭐️", "Segg")]});
              }
            } else {
              botly.sendButtons({
                id: senderId,
                text: "أنت لا تقرأ أي رواية. يرجى البحث عن رواية و بدأ قرائتها للتنقل بين الفصول",
                buttons: [
                botly.createPostbackButton("ترشيحات ⭐️", "Segg")]});
            }
          } else {
            botly.sendButtons({
              id: senderId,
              text: "لا يمكن لإسم الرواية أن يكون أقل من 3 حروف! 🙄\nهل تريد إقتراح روايات ؟ ⭐️",
              buttons: [
              botly.createPostbackButton("ترشيحات ⭐️", "Segg")]});
          }
        } else if (message.message.text.startsWith("https://")) {
          botly.sendImage({id: senderId, url: "https://i.ibb.co/d2TxPkf/gensharebot.png"}, (err, data) => {
          botly.sendButtons({
              id: senderId,
              text: "تم تحديد رابط 🔗\nهل تريد تجربة صفحتنا لتحميل الفيديوهات 🎥 بإستعمال الرابط ؟ 🙆🏻‍♂️.\nالصفحة :\nfacebook.com/Sharebotapp",
              buttons: [botly.createWebURLButton("Messenger 💬", "m.me/Sharebotapp/")],
            });
      });
        } else {
          if (user[0].os == "messenger") {
            const search = await axios.get(`https://api.wattpad.com/v4/search/stories?query=${encodeURIComponent(message.message.text)}&mature=1&free=1&paid=1&limit=10&fields=stories(id%2Ctitle%2CvoteCount%2CreadCount%2CnumParts%2Cuser%2Cmature%2Ccompleted%2Crating%2Ccover%2Cpromoted%2CisPaywalled%2CpaidModel)&language=${user[0].lang}`, { headers: headers });
            
            const list = [];
            search.data.stories.forEach((x) => {
              const contents = {
                title: `${x.title}`,
                image_url: `${x.cover}`,
                subtitle: `${x.user.name} 👤 | ${x.readCount} 👁‍🗨 | جزء ${x.numParts}`,
                buttons: [botly.createPostbackButton('بدأ قراءة الرواية 📖', `${x.id}`),
                          botly.createPostbackButton('قراءة وصف الرواية ℹ', `${x.id}`),
                          botly.createPostbackButton('الإعدادات ⚙', "Settings")]
              }
              list.push(contents);
              });
              botly.sendGeneric({id: senderId, elements: list, aspectRatio: Botly.CONST.IMAGE_ASPECT_RATIO.SQUARE});
  
           } else {
            const search = await axios.get(`https://api.wattpad.com/v4/search/stories?query=${encodeURIComponent(message.message.text)}&mature=1&free=1&paid=1&limit=5&fields=stories(id%2Ctitle%2CvoteCount%2CreadCount%2CnumParts%2Cuser%2Cmature%2Ccompleted%2Crating%2Ccover%2Cpromoted%2CisPaywalled%2CpaidModel)&language=${user[0].lang}`, { headers: headers });
  
            search.data.stories.forEach((x, i) => {
              setTimeout(function(){
                const contents = {
                  title: `${x.title}`,
                  image_url: `${x.cover}`,
                  subtitle: `${x.user.name} 👤 | ${x.readCount} 👁‍🗨 | جزء ${x.numParts}`,
                  buttons: [botly.createPostbackButton('بدأ قراءة الرواية 📖', `${x.id}`),
                            botly.createPostbackButton('قراءة وصف الرواية ℹ', `${x.id}`),
                            botly.createPostbackButton('الإعدادات ⚙', "Settings")]
                }
                botly.sendGeneric({id: senderId, elements: [contents], aspectRatio: Botly.CONST.IMAGE_ASPECT_RATIO.SQUARE});
               }
              , i * 1000);
              });
           }
        }
      }
    } else { // new
      await createUser({uid: senderId, os: null, pad: null, lang: null, name: null, version: botVer})
      .then((data, error) => {
        botly.sendText({
          id: senderId,
          text: "يا أهلا 💜\nمرحبا بك لأول مرة في بوتباد 😄\nإن كنت جديد هنا 👀. بوتباد هو بوت يقوم بجلب الروايات من تطبيق واتباد الشهير!\nيمكنك إستعمال الكتابة ✍️ للبحث مثلا (أنت لي) أو (الياكوزا).\nلا يوجد أي داعي لإرسال أهلا أو وداعاً فهي رسائل لروبوتات الذكاء الصناعي 😅.\nالأن بعد أن تطرقنا لكل شيئ بقي عليك الضغط على بدأ 👇🏻 لكي نختار تفضيلاتك ✅",
          quick_replies: [
            botly.createQuickReply("بدأ ⬅️", "start")
          ],
        });
      });
    }
  } else if (message.message.attachments[0].payload.sticker_id) {
    botly.sendText({ id: senderId, text: "(Y)" });
  } else if (message.message.attachments[0].type == "image" || message.message.attachments[0].type == "audio" || message.message.attachments[0].type == "video") {
    botly.sendButtons({
      id: senderId,
      text: "لا يمكن البحث بالوسائط 📷.\nيرجى كتابة إسم رواية معينة أو الضغط على ترشيحات حتى أقدم لك روايات مقترحة 😅",
      buttons: [
      botly.createPostbackButton("ترشيحات ⭐️", "Segg")]});
  }
});


botly.on("postback", async (senderId, message, postback) => {
  const timer = (ms) => new Promise((res) => setTimeout(res, ms));
  if (message.postback) {
    if (postback == "GET_STARTED") {
      const user = await userDb(senderId);
      if (user[0]) {
        botly.sendText({ id: senderId, text: "مرحبا مجددا ♥" });
      } else {
        await createUser({uid: senderId, os: null, pad: null, lang: null, name: null, version: botVer})
          .then((data, error) => {
            botly.sendText({
              id: senderId,
              text: "يا أهلا 💜\nمرحبا بك لأول مرة في بوتباد 😄\nإن كنت جديد هنا 👀. بوتباد هو بوت يقوم بجلب الروايات من تطبيق واتباد الشهير!\nيمكنك إستعمال الكتابة ✍️ للبحث مثلا (أنت لي) أو (الياكوزا).\nلا يوجد أي داعي لإرسال أهلا أو وداعاً فهي رسائل لروبوتات الذكاء الصناعي 😅.\nالأن بعد أن تطرقنا لكل شيئ بقي عليك الضغط على بدأ 👇🏻 لكي نختار تفضيلاتك ✅",
              quick_replies: [
                botly.createQuickReply("بدأ ⬅️", "start")
              ],
            });
          });
      }
    } else if (postback == "Settings") {
      const pree = (term) => {
        if (term == "16") {
          return "العربية 🇩🇿";
        } else if (term == "1") {
          return "الانجليزية 🇺🇸";
        } else if (term == "messenger") {
          return "ماسنجر 💬";
        } else if (term == "lite") {
          return "فيسبوك لايت 🗨️";
        } else if (term == ".") {
          return ".";
        }
      };
      
      const user = await userDb(senderId);
      botly.sendText({ // pree(user[0].mature)
        id: senderId,
        text: `مرحبا 👋🏻🌹\nإليك الاعدادات الخاصة بك 🪪 :\n• الإسم 👤 : ${user[0].name}.\n• اللغة 🌐 : ${pree(user[0].lang)}.\n• المنصة 📱 : ${pree(user[0].os)}.\nإذا أردت تعديل أي خيار منهم ✍️ يمكنك الضغط على زر التغيير 👇🏻`,
        quick_replies: [
          botly.createQuickReply("تغيير الاسم 👤", "namechange"),
          botly.createQuickReply("تغيير اللغة 🌐", "langchange"),
          botly.createQuickReply("تغيير المنصة 📱", "oschange")
        ],
      });
    } else if (postback == "Segg") {
      botly.sendText({ id: senderId, text: "لم يتم إضافة الميز بعد" });
    } else if (postback == "mature0") {
      //
    } else if (postback == "mature1") {
      //
    } else if (postback == "123123") {
      //
    } else if (postback.startsWith("cn-")) {
      //
    } else if (message.postback.title == "قراءة وصف الرواية ℹ") {
      const tran = (term) => {
        if (term == "true" || term == true) {
          return "نعم ☑";
        } else if (term == "false" || term == false) {
          return "لا ❎";
        } else if (term == ".") {
          return ".";
        }
      };

      const desc = await axios.get(`https://www.wattpad.com/api/v3/stories/${postback}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`, { headers : headers2});
      const tagsShaped = desc.data.tags.join(", ");
      botly.sendText({ 
        id: senderId,
        text: `وصف الرواية 📥 :\n• الكاتب 👤 : ${desc.data.user.name}\n• عدد القراء 👁️‍🗨️ : ${desc.data.readCount}\n• التقييم ⭐️ : ${desc.data.rating}\n• التصنيفات 🏷️ : ${tagsShaped}\n• مكتمل 🗂 ؟ : ${tran(desc.data.completed)}\n• عدد الأجزاء 📃 : ${desc.data.numParts}\n• شرح الكاتب :\n${desc.data.description}`,
        quick_replies: [
          botly.createQuickReply("بدأ القراءة ⬅️", desc.data.id)
        ],
      });
    } else if (message.postback.title == "بدأ قراءة الرواية 📖") {
      await updateUser(senderId, {pad: postback})
      .then(async (data, error) => {
        if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }

        const read = await axios.get(`https://www.wattpad.com/api/v3/stories/${postback}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`, { headers : headers2});

        var text = await getStory(read.data.parts[0].id);
  
        const parts = [];
        let currentPart = '';
  
        const words = text.split(' ');
        
        for (const word of words) {
          if ((currentPart + ' ' + word).length <= 2000) {
            currentPart += (currentPart ? ' ' : '') + word;
          } else {
            parts.push(currentPart);
            currentPart = word;
          }
        }
  
        if (currentPart) {
          parts.push(currentPart);
        }
  
        botly.sendText({ 
          id: senderId,
          text: `الرواية تحتوي على (${read.data.numParts}) أجزاء 📖 إذا اردت الذهاب لجزء معين ⬅️ يرجى كتابة رقم الجزء و سأخذك إليه مباشرة 🎯`,
          quick_replies: [
            botly.createQuickReply("الجزء التالي ◀️", `${postback}-1`)
          ],
        }, async (err, data) => {
          for (const part of parts) {
            botly.sendText({ 
              id: senderId,
              text: part,
              quick_replies: [
                botly.createQuickReply("الجزء التالي ◀️", `${postback}-1`)
              ],
            });
            await timer(1500);
          }
        });
      });
    } else if (message.postback.title == "3") {
      //
    } else if (message.postback.title == "4") {
      //
    } else if (message.postback.title == "5") {
      //
    }
  } else {
    if (postback == "Settings") {
      const pree = (term) => {
        if (term == "16") {
          return "العربية 🇩🇿";
        } else if (term == "1") {
          return "الانجليزية 🇺🇸";
        } else if (term == "messenger") {
          return "ماسنجر 💬";
        } else if (term == "lite") {
          return "فيسبوك لايت 🗨️";
        } else if (term == ".") {
          return ".";
        }
      };
      
      const user = await userDb(senderId);
      botly.sendText({ // pree(user[0].mature)
        id: senderId,
        text: `مرحبا بك 💜 إليك إعداداتك 🪪 :\nإسمك 👤 : ${user[0].name}\nلغة الروايات 🌐 : ${pree(user[0].lang)}\nالمنصة 📱 : ${pree(user[0].os)}`,
        quick_replies: [
          botly.createQuickReply("تغيير الاسم 👤", "namechange"),
          botly.createQuickReply("تغيير اللغة 🌐", "langchange"),
          botly.createQuickReply("تغيير المنصة 📱", "oschange")
        ],
      });
    } else if (postback.length == 17) {
      //
    } else if (postback == "start") {
      botly.sendText({
        id: senderId,
        text: "حسنا لنبدأ 😄\nماهي المنصة التي تستعملها 📱 ؟",
        quick_replies: [
          botly.createQuickReply("Messenger 💬", "s-messenger"),
          botly.createQuickReply("Lite 🗨️", "s-lite")
        ],
      });
    } else if (postback == "s-messenger" || postback == "s-lite") {
      var shape = postback.slice(2);
      await updateUser(senderId, {os: shape})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({
              id: senderId,
              text: "تم الحفظ ✅\nماهي اللغة التي تريد أن تقرأ بها 🌐 ؟",
              quick_replies: [
                botly.createQuickReply("العربية 🇩🇿", "s-16"),
                botly.createQuickReply("الانجليزية 🇺🇸", "s-1")
              ],
            });
          });
    } else if (postback == "s-16" || postback == "s-1") {
      var shape = postback.slice(2);
      await updateUser(senderId, {lang: shape})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({
              id: senderId,
              text: "مفهوم ✅\nتوجد روايات (إسمك) 👀 إذا أردت تغيير الاسم الى إسمك الخاص لجعل الرواية أكثر متعة أكتب إسمك الخاص 😅👇🏻",
              quick_replies: [
                botly.createQuickReply("تخطي ⬅️", "skip")
              ],
            });
          });
    } else if (postback == "skip") {
      await updateUser(senderId, {name: "skipped"})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({id: senderId, text: "تم التخطي ✅ شكرا لك 🥰"});
          });
    } else if (postback == "namechange") {
      await updateUser(senderId, {name: null})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({
              id: senderId,
              text: "حسنا! 😅\nالمرجو كتابة إسم جديد تريده... 🙄",
              quick_replies: [
                botly.createQuickReply("تخطي ⬅️", "skip")
              ],
            });
          });
    } else if (postback == "langchange") {
      botly.sendText({
        id: senderId,
        text: "يرجى إختيار اللغة التي تفضلها 🌐",
        quick_replies: [
          botly.createQuickReply("العربية 🇩🇿", "16"),
          botly.createQuickReply("الانجليزية 🇺🇸", "1")
        ],
      });
    } else if (postback == "oschange") {
      botly.sendText({
        id: senderId,
        text: "يرجى إختيار التطبيق الذي تستعمله 🤔💬 ؟",
        quick_replies: [
          botly.createQuickReply("Messenger 💬", "messenger"),
          botly.createQuickReply("Lite 🗨️", "lite")
        ],
      });
    } else if (postback == "rename") {
      botly.sendText({
        id: senderId,
        text: "حسنا ✅\nيرجى كتابة إسم جديد 🙄",
        quick_replies: [
          botly.createQuickReply("تخطي ⬅️", "skip")
        ],
      });
    } else if (postback == "--") {

    } else if (message.message.text == "Lite 🗨️" || message.message.text == "Messenger 💬") {
      await updateUser(senderId, {os: postback})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({id: senderId, text: "تم حفظ إختيارك ✅"});
          });
    } else if (message.message.text == "العربية 🇩🇿" || message.message.text == "الانجليزية 🇺🇸") {
      await updateUser(senderId, {lang: postback})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({id: senderId, text: "تم حفظ إختيارك ✅"});
          });
    } else if (message.message.text == "قبول ✅") {
      await updateUser(senderId, {name: postback})
          .then((data, error) => {
            if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
            botly.sendText({id: senderId, text: "تم حفظ إختيارك ✅"});
          });
    } else if (message.message.text == "بدأ القراءة ⬅️") {
      await updateUser(senderId, {pad: postback})
      .then(async (data, error) => {
        if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
        const read = await axios.get(`https://www.wattpad.com/api/v3/stories/${postback}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`, { headers : headers2});

        var text = await getStory(read.data.parts[0].id);
        
        const parts = [];
        let currentPart = '';
        const words = text.split(' ');
        for (const word of words) {
          if ((currentPart + ' ' + word).length <= 2000) {
            currentPart += (currentPart ? ' ' : '') + word;
          } else {
            parts.push(currentPart);
            currentPart = word;
          }
        }
        
        if (currentPart) {
          parts.push(currentPart);
        }

        botly.sendText({ 
          id: senderId,
          text: `الرواية تحتوي على (${read.data.numParts}) أجزاء 📖 إذا اردت الذهاب لجزء معين ⬅️ يرجى كتابة رقم الجزء و سأخذك إليه مباشرة 🎯`,
          quick_replies: [
            botly.createQuickReply("الجزء التالي ◀️", `${postback}-1`)
          ],
        }, async (err, data) => {
          for (const part of parts) {
            botly.sendText({ 
              id: senderId,
              text: part,
              quick_replies: [
                botly.createQuickReply("الجزء التالي ◀️", `${postback}-1`)
              ],
            });
            await timer(1500);
          }
        });
      });
    } else if (message.message.text == "الجزء التالي ◀️") {
      const prts = postback.split("-");
      const pi = parseInt(prts[1]);
      const read = await axios.get(`https://www.wattpad.com/api/v3/stories/${prts[0]}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`, { headers : headers2});
      console.log(pi)
      if (pi == read.data.numParts) {
        botly.sendButtons({
          id: senderId,
          text: "إنتهت كل أجزاء الرواية 😅\nإذا كنت تريد المزيد من الروايات إضغط ترشيحات ⭐️ أو ٱكتب إسم رواية تعرفها 😄\nو فضلاً لا تنسى متابعة حساب الصانع 💜😺",
          buttons: [
          botly.createPostbackButton("ترشيحات ⭐️", "Segg"),
          botly.createWebURLButton("حساب الصانع 🇩🇿", "facebook.com/0xNoti/")]});
      } else {
        var text = await getStory(read.data.parts[pi].id);
        const parts = [];
        let currentPart = '';
        const words = text.split(' ');

        for (const word of words) {
          if ((currentPart + ' ' + word).length <= 2000) {
            currentPart += (currentPart ? ' ' : '') + word;
          } else {
            parts.push(currentPart);
            currentPart = word;
          }
        }
        
        if (currentPart) {
          parts.push(currentPart);
        }
        
        for (const part of parts) {
          botly.sendText({ 
            id: senderId,
            text: part,
            quick_replies: [
              botly.createQuickReply("الجزء التالي ◀️", `${prts[0]}-${pi + 1}`)
            ],
          });
          await timer(1500);
        }
      }
    } else if (message.message.text == "xx") {
      //
    }
  }
});

app.listen(3000, () => {
    console.log('App listening on port 3000!');
});
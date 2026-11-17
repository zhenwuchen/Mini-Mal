
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 1. 商品分类
const categories = [
    {
        name: "电子产品",
        slug: "electronics",
        description: "精选数码与电子产品",
    },
    {
        name: "服饰穿搭",
        slug: "fashion",
        description: "简约时尚服饰",
    },
    {
        name: "家居生活",
        slug: "home-living",
        description: "提升生活品质的家居用品",
    },
    {
        name: "美妆个护",
        slug: "beauty",
        description: "日常美妆与个人护理",
    },
];

// 2. 商品数据
const products = [
    // 电子产品
    {
        name: "无线蓝牙耳机",
        slug: "wireless-earbuds",
        description: "高清音质，舒适佩戴，长效续航",
        price: 19900,
        stock: 50,
        categorySlug: "electronics",
        imageUrl: "/images/catalog/wireless-earbuds.jpg",
    },
    {
        name: "智能手表",
        slug: "smart-watch",
        description: "健康监测与运动记录",
        price: 39900,
        stock: 30,
        categorySlug: "electronics",
        imageUrl: "/images/catalog/smart-watch.jpg",
    },
    {
        name: "机械键盘",
        slug: "mechanical-keyboard",
        description: "简约设计，舒适敲击体验",
        price: 29900,
        stock: 40,
        categorySlug: "electronics",
        imageUrl: "/images/catalog/mechanical-keyboard.jpg",
    },
    {
        name: "无线鼠标",
        slug: "wireless-mouse",
        description: "轻巧便携，精准操控",
        price: 9900,
        stock: 60,
        categorySlug: "electronics",
        imageUrl: "/images/catalog/wireless-mouse.jpg",
    },
    {
        name: "便携蓝牙音箱",
        slug: "bluetooth-speaker",
        description: "小巧机身，清晰音质",
        price: 15900,
        stock: 35,
        categorySlug: "electronics",
        imageUrl: "/images/catalog/bluetooth-speaker.jpg",
    },

    // 服饰穿搭
    {
        name: "纯棉基础款 T 恤",
        slug: "cotton-basic-tshirt",
        description: "柔软亲肤，简约百搭",
        price: 7900,
        stock: 100,
        categorySlug: "fashion",
        imageUrl: "/images/catalog/cotton-basic-tshirt.jpg",
    },
    {
        name: "休闲卫衣",
        slug: "casual-sweatshirt",
        description: "宽松版型，舒适日常",
        price: 15900,
        stock: 60,
        categorySlug: "fashion",
        imageUrl: "/images/catalog/casual-sweatshirt.jpg",
    },
    {
        name: "经典牛仔裤",
        slug: "classic-jeans",
        description: "经典剪裁，轻松搭配",
        price: 18900,
        stock: 45,
        categorySlug: "fashion",
        imageUrl: "/images/catalog/classic-jeans.jpg",
    },
    {
        name: "休闲帆布鞋",
        slug: "canvas-sneakers",
        description: "轻便舒适，日常通勤",
        price: 22900,
        stock: 40,
        categorySlug: "fashion",
        imageUrl: "/images/catalog/canvas-sneakers.jpg",
    },
    {
        name: "极简棒球帽",
        slug: "minimal-baseball-cap",
        description: "简约造型，日常百搭",
        price: 6900,
        stock: 80,
        categorySlug: "fashion",
        imageUrl: "/images/catalog/minimal-baseball-cap.jpg",
    },

    // 家居生活
    {
        name: "北欧风台灯",
        slug: "nordic-table-lamp",
        description: "温暖柔和，营造舒适氛围",
        price: 25900,
        stock: 25,
        categorySlug: "home-living",
        imageUrl: "/images/catalog/nordic-table-lamp.jpg",
    },
    {
        name: "陶瓷咖啡杯",
        slug: "ceramic-coffee-cup",
        description: "简约陶瓷，细腻质感",
        price: 5900,
        stock: 100,
        categorySlug: "home-living",
        imageUrl: "/images/catalog/ceramic-coffee-cup.jpg",
    },
    {
        name: "香薰蜡烛",
        slug: "scented-candle",
        description: "舒缓香气，放松身心",
        price: 8900,
        stock: 70,
        categorySlug: "home-living",
        imageUrl: "/images/catalog/scented-candle.jpg",
    },
    {
        name: "收纳置物架",
        slug: "storage-rack",
        description: "简洁实用，让空间更整洁",
        price: 12900,
        stock: 30,
        categorySlug: "home-living",
        imageUrl: "/images/catalog/storage-rack.jpg",
    },
    {
        name: "纯棉抱枕",
        slug: "cotton-cushion",
        description: "柔软舒适，点缀家居空间",
        price: 6900,
        stock: 55,
        categorySlug: "home-living",
        imageUrl: "/images/catalog/cotton-cushion.jpg",
    },

    // 美妆个护
    {
        name: "保湿面霜",
        slug: "moisturizing-cream",
        description: "日常保湿护理",
        price: 12900,
        stock: 50,
        categorySlug: "beauty",
        imageUrl: "/images/catalog/moisturizing-cream.jpg",
    },
    {
        name: "洁面乳",
        slug: "facial-cleanser",
        description: "温和清洁，清爽舒适",
        price: 6900,
        stock: 80,
        categorySlug: "beauty",
        imageUrl: "/images/catalog/facial-cleanser.jpg",
    },
    {
        name: "护手霜",
        slug: "hand-cream",
        description: "滋润双手，清新香气",
        price: 3900,
        stock: 100,
        categorySlug: "beauty",
        imageUrl: "/images/catalog/hand-cream.jpg",
    },
    {
        name: "防晒乳",
        slug: "sunscreen-lotion",
        description: "日常防晒护理",
        price: 9900,
        stock: 60,
        categorySlug: "beauty",
        imageUrl: "/images/catalog/sunscreen-lotion.jpg",
    },
    {
        name: "身体护理套装",
        slug: "body-care-set",
        description: "日常身体清洁与护理",
        price: 19900,
        stock: 35,
        categorySlug: "beauty",
        imageUrl: "/images/catalog/body-care-set.jpg",
    },
];

async function main() {
    console.log("开始初始化 Mini Mal1 数据...");

    // 3. 创建或更新管理员
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || "Mini Mal1 Admin";

    if (!email || !password || password.length < 12) {
        throw new Error(
            "请在 .env 中配置 ADMIN_EMAIL 和至少 12 位的 ADMIN_PASSWORD"
        );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.upsert({
        where: { email },
        update: {
            name,
            role: "ADMIN",
        },
        create: {
            name,
            email,
            passwordHash,
            role: "ADMIN",
        },
    });

    console.log("管理员初始化完成");

    // 4. 创建商品分类
    for (const category of categories) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: {
                name: category.name,
                description: category.description,
            },
            create: category,
        });
    }

    console.log("商品分类初始化完成");

    // 5. 创建商品
    for (const product of products) {
        const { categorySlug, ...productData } = product;

        const category = await prisma.category.findUnique({
            where: { slug: categorySlug },
        });

        if (!category) {
            throw new Error(`找不到商品分类：${categorySlug}`);
        }

        await prisma.product.upsert({
            where: { slug: product.slug },
            update: {
                ...productData,
                categoryId: category.id,
            },
            create: {
                ...productData,
                categoryId: category.id,
            },
        });
    }

    console.log("20 个商品初始化完成");
    console.log("Mini Mal1 数据初始化成功！");
}

main()
    .catch((error) => {
        console.error("Seed 初始化失败：", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

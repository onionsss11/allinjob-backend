import { Language, QNet, SubCategory } from '@prisma/client';
import {
    CompetitionType,
    InternType,
    OutsideType,
    createCrawiling,
    createLanguagePaths,
    createLinkareerPaths,
    createPaths,
    createQNet,
    findCrawling,
    findeDetail,
    findeDetailType,
    languagePath,
    paths,
    testType,
} from '../../common/crawiling/interface';
import { CustomPrismaClient } from '../../database/prismaConfig';
import { Service } from 'typedi';
import { UserService } from '../users/users.service';

@Service()
export class CrawlingService {
    constructor(
        private readonly prisma: CustomPrismaClient, //
        private readonly userService: UserService, //
    ) {}

    async findeCrawling({ ...data }: paths): Promise<findCrawling> {
        const { path, page, ..._data } = data;
        const datas: { [key: string]: string } = { ..._data };
        const keywords: object[] = [];
        for (const key in _data) {
            const value = datas[key];
            if (key === 'scale') {
                const [start, end] = value.split(',');
                const scaleKeyword = !end
                    ? { gte: +start }
                    : { gte: +start || 0, lte: +end || 0 };

                keywords.push({ [key]: scaleKeyword });
            } else if (key === 'mainCategory') {
                keywords.push(
                    ...value.split(',').map((el: string) => ({
                        subCategory: { [key]: { keyword: el } },
                    })),
                );
            } else if (key === 'subCategory') {
                keywords.push(
                    ...value
                        .split(',')
                        .map((el: string) => ({ [key]: { keyword: el } })),
                );
            } else if (path === 'language') {
                keywords.push(
                    ...value.split(',').map((el: string) => ({ [key]: el })),
                );
            } else {
                keywords.push(
                    ...value
                        .split(',')
                        .map((el: string) => ({ [key]: { contains: el } })),
                );
            }
        }

        const obj = {
            outside: () =>
                this.prisma.outside.findMany({
                    where: keywords.length
                        ? {
                              OR: keywords.map((el: object) => el),
                          }
                        : {
                              AND: [],
                          },
                    select: {
                        id: true,
                        title: true,
                        view: true,
                        enterprise: true,
                        Dday: true,
                        mainImage: true,
                        applicationPeriod: true,
                    },
                    ...(page && { skip: (+page - 1) * 12 }),
                    ...(page && { take: +page * 12 }),
                }),

            intern: () =>
                this.prisma.intern.findMany({
                    where: keywords.length
                        ? {
                              OR: keywords.map((el: object) => el),
                          }
                        : {
                              AND: [],
                          },
                    select: {
                        id: true,
                        title: true,
                        view: true,
                        enterprise: true,
                        Dday: true,
                        mainImage: true,
                        applicationPeriod: true,
                        region: true,
                    },
                    ...(page && { skip: (+page - 1) * 12 }),
                    ...(page && { take: +page * 12 }),
                }),
            competition: () =>
                this.prisma.competition.findMany({
                    where: keywords.length
                        ? {
                              OR: keywords.map((el: object) => el),
                          }
                        : {
                              AND: [],
                          },
                    select: {
                        id: true,
                        title: true,
                        view: true,
                        enterprise: true,
                        Dday: true,
                        mainImage: true,
                        applicationPeriod: true,
                    },
                    ...(page && { skip: (+page - 1) * 12 }),
                    ...(page && { take: +page * 12 }),
                }),
            language: () =>
                this.prisma.language.findMany({
                    where: data.classify
                        ? keywords.length >= 3
                            ? {
                                  OR: keywords.map((el: object) => el),
                              }
                            : {
                                  AND: keywords.map((el: object) => el),
                              }
                        : {
                              OR: keywords.map((el: object) => el),
                          },
                    ...(page && { skip: (+page - 1) * 12 }),
                    ...(page && { take: +page * 12 }),
                }),
            qnet: () =>
                this.prisma.qNet.findMany({
                    where: {
                        AND: keywords.length
                            ? keywords.map((el: object) => el)
                            : [],
                    },
                    include: {
                        examSchedules: true,
                        subCategory: {
                            include: {
                                mainCategory: true,
                            },
                        },
                    },
                }),
        };
        return (obj[path] || obj['language'])();
    }

    // user service
    // findCrawling

    async findeDetailCrawling({
        path,
        id,
    }: findeDetailType): Promise<findeDetail | null> {
        const obj = {
            outside: () =>
                this.prisma.outside.update({
                    where: { id },
                    data: { view: { increment: 1 } },
                }),
            intern: () =>
                this.prisma.intern.update({
                    where: { id },
                    data: { view: { increment: 1 } },
                }),
            competition: () =>
                this.prisma.competition.update({
                    where: { id },
                    data: { view: { increment: 1 } },
                }),
            language: () => this.prisma.language.findUnique({ where: { id } }),
            qnet: () =>
                this.prisma.qNet.findUnique({
                    where: { id },
                    include: {
                        examSchedules: true,
                    },
                }),
        };

        return (obj[path] || obj['language'])();
    }

    findSubCategory(keyword: string): Promise<SubCategory | null> {
        return this.prisma.subCategory.findUnique({
            where: { keyword },
        });
    }

    async createMainCategory(
        mainKeyword: string,
        subKeyword: string,
    ): Promise<SubCategory> {
        let mainCategory;

        try {
            mainCategory = await this.prisma.mainCategory.create({
                data: {
                    keyword: mainKeyword,
                },
            });
        } catch (error) {
            mainCategory = await this.prisma.mainCategory.findUnique({
                where: { keyword: mainKeyword },
            });
        }

        let subCategory;

        try {
            subCategory = await this.prisma.subCategory.create({
                data: {
                    keyword: subKeyword,
                    mainCategoryId: mainCategory!.id,
                },
            });
        } catch (error) {
            subCategory = await this.findSubCategory(subKeyword);
        }

        return subCategory!;
    }

    async createLanguageData({
        classify,
        test,
        homePage,
        dataObj,
    }: languagePath): Promise<Language> {
        return await this.prisma.language.create({
            data: { test, classify, homePage, ...dataObj },
        });
    }

    async createLinkareerData<T extends object>({
        data,
        path,
        month,
    }: {
        data: T;
        path: createLinkareerPaths;
        month: number;
    }): Promise<createCrawiling> {
        const result = {
            outside: async () =>
                await this.prisma.outside.create({
                    data: { ...(data as OutsideType), month },
                }),
            intern: async () =>
                await this.prisma.intern.create({ data: data as InternType }),
            competition: async () =>
                await this.prisma.competition.create({
                    data: {
                        ...(data as CompetitionType),
                        scale: +(data as CompetitionType).scale,
                    },
                }),
        };

        return result[path]();
    }

    async createQNetData({
        data,
        mdobligFldNm: keyword,
    }: createQNet): Promise<QNet> {
        const subCategory = await this.findSubCategory(keyword);

        return await this.prisma.qNet.create({
            data: {
                ...data,
                examSchedules: {
                    createMany: {
                        data: data.examSchedules,
                    },
                },
                subCategoryId: subCategory!.id,
            },
        });
    }
}

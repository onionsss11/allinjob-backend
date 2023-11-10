import {
    Path,
    createLinkareerPaths,
    createQNet,
    findeDetailType,
    languagePath,
    paths,
} from '../../common/crawiling/interface';
import { Service } from 'typedi';
import { UserService } from '../users/users.service';
import { ElasitcClient } from '../../database/elasticConfig';
import { CommunityService } from '../community/community.service';
import { cludes } from '../../common/util/return_data_cludes';
import { bestDataType } from './interfaces/returnType/bestData.interface';
import { findeDetailCrawling } from './interfaces/returnType/findDetailCrawling.interface';
import { findCrawling } from './interfaces/returnType/findeCrawling.interface';
import RedisClient from '../../database/redisConfig';
import { examSchedulesSort } from '../../common/util/examSchedules.sort';
import { dateToString, languageTitle } from '../../common/util/languageData';
import { splitDate } from '../../common/util/splitDate';
import { randomSolution } from '../../common/util/return_data_randomSolution';

@Service()
export class CrawlingService {
    constructor(
        private readonly elastic: ElasitcClient,
        private readonly redis: RedisClient,
        private readonly userService: UserService,
        private readonly communityService: CommunityService,
    ) {}

    async findeCrawling({ ...data }: paths): Promise<findCrawling[]> {
        const { path, page, count, ..._data } = data;

        const datas: { [key: string]: string } = { ..._data };
        const must: object[] = [];
        for (const key in _data) {
            const value = datas[key];
            if (key === 'scale') {
                const [start, end] = value.split(',');
                const scaleKeyword = !end
                    ? { gte: +start }
                    : { gte: +start || 0, lte: +end };
                must.push({ range: { [key]: scaleKeyword } });
            } else {
                must.push({
                    match: { [key]: value.replace(',', ' ') },
                });
            }
        }

        return this.elastic
            .search({
                index: `${path}*`,
                _source_includes: cludes(path),
                body: {
                    sort:
                        path === 'language'
                            ? [
                                  {
                                      examDate: {
                                          order: 'asc',
                                      },
                                  },
                              ]
                            : [{ view: { order: 'desc' } }],
                    query: {
                        ...(must.length
                            ? {
                                  bool: { must },
                              }
                            : { match_all: {} }),
                    },
                    size: 12,
                    from: (+page - 1 || 0) * 12,
                },
            })
            .then((data) => {
                return count
                    ? data.body.hits.total.value
                    : data.body.hits.hits.length
                    ? data.body.hits.hits.map((el: any) => {
                          const { examDate, closeDate, test, period } =
                              el._source;

                          delete el._source.test, delete el._source.period;

                          if (path === 'intern')
                              delete el._source.scrap, delete el._source.Dday;
                          if (path === 'qnet')
                              delete el._source.scrap, delete el._source.view;

                          return {
                              id: el._id,
                              ...el._source,
                              ...(path === 'intern' && {
                                  closeDate: splitDate(period),
                              }),
                              ...(path === 'language' && {
                                  title: languageTitle(test),
                                  ...dateToString({
                                      eDate: examDate,
                                      cDate: closeDate,
                                  }),
                              }),
                              ...(path === 'qnet' && {
                                  ...examSchedulesSort(el),
                              }),
                          };
                      })
                    : [];
            });
    }

    async myKeywordCrawling({
        ...data
    }: paths & { id: string }): Promise<findCrawling[]> {
        const userKeyword = await this.userService.findUserKeyword({
            ...data,
        });
        if (!userKeyword) return [];

        const obj = {
            competition: 'interests',
            outside: 'field',
            intern: 'institution',
            qnet: 'mainCategory',
            language: 'test',
        };
        const { id, ..._data } = { ...data };
        const params = {
            ..._data,
            ...(userKeyword.length && { [obj[data.path]]: userKeyword }),
        };

        return this.findeCrawling(params);
    }

    async findeDetailCrawling({
        path,
        id,
    }: findeDetailType): Promise<findeDetailCrawling | null> {
        return this.elastic
            .update(
                {
                    index: path,
                    id,
                    body: {
                        script: {
                            source: 'ctx._source.view++',
                        },
                        _source: true,
                    },
                },
                { ignore: [404] },
            )
            .then((el) => {
                return {
                    ...(path === 'qnet' && {
                        mainImage: process.env.QNET_IMAGE,
                    }),
                    ...(el.body.error ? el.meta.context : el.body.get._source),
                };
            });
    }

    async createLanguageData({ ...data }: languagePath): Promise<boolean> {
        await this.elastic.index({
            index: 'language',
            body: { ...data },
        });
        return true;
    }

    async createLinkareerData<T extends object>({
        data,
        path,
        month,
        scale,
    }: {
        data: T;
        path: createLinkareerPaths;
        month: number;
        scale?: number | undefined;
    }): Promise<boolean> {
        await this.elastic.index({
            index: path,
            body: {
                ...data,
                scrap: 0,
                ...(scale && { scale }),
                ...(month && { month }),
            },
        });

        return true;
    }

    async createQNetData({
        categoryObj,
        ...data
    }: createQNet): Promise<boolean> {
        await this.elastic.index({
            index: 'qnet',
            body: { ...categoryObj, ...data },
        });

        return true;
    }

    async bsetData({
        path,
    }: Path | { path: 'community' }): Promise<bestDataType[]> {
        if (path === 'community') return this.communityService.findeMany({});

        return this.elastic
            .search({
                index: path,
                _source_includes: cludes(path),
                body: {
                    sort: { view: { order: 'desc' } },
                    query: {
                        match_all: {},
                    },
                },
                size: 12,
            })
            .then((el) =>
                el.body.hits.hits.map((el: any) => {
                    if (path === 'intern') {
                        delete el._source.period;
                        delete el._source.preferentialTreatment;
                    }
                    if (path === 'qnet') {
                        delete el._source.examSchedules;
                    }
                    return {
                        id: el._id,
                        ...el._source,
                        ...(path === 'qnet' && {
                            mainImage: process.env.QNET_IMAGE,
                        }),
                    };
                }),
            );
    }

    async randomCrwling(): Promise<any> {
        return await Promise.all(
            ['outside', 'competition', 'intern', 'qnet'].map(async (el) => {
                const data = await this.redis.get(el);
                return data
                    ? { [el]: JSON.parse(data) }
                    : {
                          [el]: await this.elastic
                              .search({
                                  index: el,
                                  _source_includes: randomSolution(el),
                                  body: {
                                      query: {
                                          function_score: {
                                              query: { match_all: {} },
                                              random_score: {},
                                          },
                                      },
                                  },
                                  size: 1,
                              })
                              .then((data) => {
                                  const hits = data.body.hits.hits[0];
                                  const { period, examSchedules, ...rest } =
                                      hits._source;
                                  const info = {
                                      id: hits._id,
                                      ...(el === 'intern' && {
                                          closeDate: splitDate(period),
                                      }),
                                      ...(el === 'qnet' && {
                                          mainImage: process.env.QNET_IMAGE,
                                          wtPeriod: examSchedules[0].wtPeriod,
                                          ptPeriod: examSchedules[0].ptPeriod,
                                      }),
                                      ...rest,
                                  };
                                  this.redis.set(
                                      el,
                                      JSON.stringify({ ...info }),
                                      'EX',
                                      60 * 60 * 12,
                                  );
                                  return {
                                      ...info,
                                  };
                              }),
                      };
            }),
        );
    }
}
